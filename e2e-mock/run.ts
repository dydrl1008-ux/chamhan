process.env.SETTLE_BASE_URL = 'http://127.0.0.1:18080'; process.env.SETTLE_CO_CODE = 'C001'; process.env.SETTLE_USER_ID = 'admin'; process.env.SETTLE_USER_PW = 'adminpw'; process.env.ASSET_SECRET = 'test-secret-1234567890'; process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
import { store } from './stubs/supabase-js';
import { settleLogin, fetchApprovals } from '@/lib/settlement/client';
import { saveCredential, userSession, formData, custInfo, prodInfo, prodItems, createRequest, cancelRequest, myRequests, createCustomer, lastSaleAmt } from '@/lib/settlement/request';
import { calc } from '@/lib/settlement/calc';
import { approve, cancelApproval, findRow, computeDefaults } from '@/lib/settlement/approve';
import { pollPending } from '@/lib/settlement/pending';
const R: { n: string; ok: boolean; note?: string }[] = []; const T = (n: string, ok: boolean, note = '') => R.push({ n, ok, note });
const state = async () => (await fetch('http://127.0.0.1:18080/__state')).json();
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
(async () => {
  // ---- 계정 연결 ----
  try { await saveCredential('u-yong', 'yongyong', 'wrongpw'); T('잘못된 비번 연결 → 거부', false); } catch (e: any) { T('잘못된 비번 연결 → 거부', /거부|실패/.test(e.message), e.message); }
  await saveCredential('u-yong', 'yongyong', 'yy1234'); T('계정 연결 저장(암호화) + 담당자 매핑', store.settlement_credentials.length === 1 && !store.settlement_credentials[0].pw_enc.includes('yy1234') && store.settlement_empl_map.some(m => m.empl_id === 'yongyong' && m.user_id === 'u-yong'));
  const { cookie, settleUserId } = await userSession('u-yong'); T('본인 세션', settleUserId === 'yongyong');
  const fd = await formData(cookie, settleUserId); T('폼 데이터(고객2·상품3·구분3·인센율1)', fd.customers.length === 2 && fd.products.length === 3 && fd.gubuns.length === 3 && fd.empRate === 1, JSON.stringify(fd.gubuns));
  const c1 = await custInfo(cookie, '1111111111'); const p1 = await prodInfo(cookie, 'PD-0001'); T('고객 킵 50000·상품가 27.5', Number(c1.mileage) === 50000 && Number(p1.prodAmt) === 27.5);
  // ---- 접수: 셀팜 신규 10일, 판매총액 0, 킵 사용 20000 ----
  const i1 = { prodId: 'PD-0001', custId: '1111111111', prodAmt: 27.5, prodIncentive: 0, saleAmt: 0, inflowCnt: 1200, dateWorkFrom: today, dateWorkTo: today, saleTotalAmt: 100000, gubun: '01', mileageUseInd: true, useMileage: 20000, custRate: 0, empRate: 1, existMileage: 50000 };
  const defs = await prodItems(cookie, 'PD-0001'); T('상품 항목 정의 조회 (계정/비번/슬롯번호/특이사항)', defs.length === 4 && defs[0].name === '계정');
  const r1 = await createRequest('u-yong', { ...i1, memo: '연동테스트', items: defs.map(d => ({ ...d, inputValue: d.name === '계정' ? 'newyong1008' : d.name === '비번' ? '1234' : '' })) }); const st1 = await state(); const row1 = st1.settlement.find((x: any) => x.settlementSeq === r1.seq);
  T('신버전 payload: reqDate·memo·상품항목 4개 저장', row1?.memo === '연동테스트' && row1?.reqDate === today && st1.settlementProdItems.filter((x: any) => x.settlementSeq === r1.seq).length === 4 && st1.settlementProdItems.find((x: any) => x.settlementSeq === r1.seq && x.name === '계정')?.inputValue === 'newyong1008');
  T('접수 → 정산번호 발급·승인요청 상태·담당자=본인', !!r1.seq && row1?.applyStatus === '01' && row1?.userId === 'yongyong', r1.seq);
  T('접수 값: 상품총액 33000·예상수수료 round((100000-33000)/1.1)=60909·입금예정 80000', row1.prodTotalAmt === '33000' && row1.expectRateAmt === '60909' && row1.expectAmt === '80000', `${row1.prodTotalAmt}/${row1.expectRateAmt}/${row1.expectAmt}`);
  T('킵 20000 차감 (50000→30000)', st1.customers[0].mileage === 30000 && st1.mileageHis.some((h: any) => h.page === 'AQ' && h.by === 'yongyong'));
  T('워크허브 기록(settlement_requests)', store.settlement_requests.some(x => x.action === 'create' && x.settlement_seq === r1.seq && x.ok));
  // 킵 초과 → 전송 전 차단
  try { await createRequest('u-yong', { ...i1, useMileage: 999999, existMileage: 30000 }); T('킵 초과 → 차단', false); } catch (e: any) { T('킵 초과 → 전송 전 차단', /킵/.test(e.message)); }
  // 판매가 제안
  const sa = await lastSaleAmt(cookie, '1111111111', 'PD-0001'); T('지난 요청 판매가 제안', sa === 0 || sa === null, String(sa));
  // 새 고객 등록
  await createCustomer('u-yong', { bizNo: '333-33-33333', custName: '새고객', custTel: '010' }); const st2 = await state(); T('새 고객 등록 (사업자번호 숫자화, 담당자 본인)', st2.customers.some((c: any) => c.bizNo === '3333333333' && c.empId === 'yongyong'));
  try { await createCustomer('u-yong', { bizNo: '3333333333', custName: '중복' }); T('중복 고객 → 거부', false); } catch (e: any) { T('중복 고객 → 사이트 거부 메시지 전달', /동일한/.test(e.message), e.message); }
  // ---- 감시: 승인요청 1건 감지 ----
  const pp = await pollPending(); T('승인 대기 감시: 신규 1건, 코드 01', pp.open === 1 && pp.fresh.length === 1 && pp.code === '01' && pp.healthy, JSON.stringify(pp.dist));
  // ---- 승인 (어드민): 입금 100000 그대로 → 사이트 기록 대조 ----
  const ac = await settleLogin(); const found = await findRow(ac, r1.seq!, ['01']); T('승인 대상 조회(±3일 창)', !!found);
  const d0 = computeDefaults(found!); T('팝업 기본값: 입금=입금예정 80000, 수수료=round((80000+20000-33000)/1.1)=60909', d0.confirmAmt === 80000 && d0.confirmRateAmt === 60909, `${d0.confirmAmt}/${d0.confirmRateAmt}`);
  const ap = await approve(r1.seq!, 95000, '테스트', 'u-admin');   // 초과 입금 15000 → 마일리지 적립
  const st3 = await state(); const mst = st3.settlementmst.find((m: any) => m.settlementSeq === r1.seq);
  T('승인 → 사이트 상태 02·승인번호·기록값 = 워크허브 값', ap.verified && ap.match && mst.confirmAmt === '95000' && mst.confirmMileage === '15000' && mst.confirmRateAmt === String(Math.round((80000 + 20000 - 33000) * 1 / 1.1)), JSON.stringify({ mst, site: ap.site }));
  T('초과 입금 15000 → 고객 킵 적립 (30000→45000)', st3.customers[0].mileage === 45000);
  T('워크허브 기록(settlement_actions, 일치)', store.settlement_actions.some(x => x.action === 'approve' && x.ok && /일치/.test(x.result)));
  try { await approve(r1.seq!, 1, '', 'u-admin'); T('이미 승인된 건 재승인 → 차단', false); } catch (e: any) { T('이미 승인된 건 재승인 → 차단', /승인요청 상태가 아닙니다/.test(e.message), e.message); }
  // ---- 감시: 처리됨 ----
  const pp2 = await pollPending(); T('감시: 승인된 건 대기에서 해소', pp2.open === 0 && pp2.resolved === 0 /* approve 가 이미 resolved 처리 */ || pp2.open === 0);
  // ---- 승인취소 ----
  const cx = await cancelApproval(r1.seq!, 'u-admin'); const st4 = await state(); T('승인취소 → 상태 03·승인기록 삭제', cx.verified && st4.settlement.find((x: any) => x.settlementSeq === r1.seq).applyStatus === '03' && !st4.settlementmst.some((m: any) => m.settlementSeq === r1.seq));
  // ---- 직원 요청취소 (승인요청 상태 건) ----
  const r2 = await createRequest('u-yong', { ...i1, mileageUseInd: false, useMileage: 0, saleTotalAmt: 50000 });
  await cancelRequest('u-yong', r2.seq!); const st5 = await state(); T('직원 요청취소 → 상태 C', st5.settlement.find((x: any) => x.settlementSeq === r2.seq).applyStatus === 'C');
  try { await cancelRequest('u-yong', r1.seq!); T('승인취소된 건 요청취소 → 차단', false); } catch (e: any) { T('승인요청 아닌 건 요청취소 → 차단', /승인요청 상태만/.test(e.message)); }
  // ---- 선입금(05) 접수·승인 고정값 ----
  const r3 = await createRequest('u-yong', { prodId: 'PD-0060', custId: '2222222222', prodAmt: 0, prodIncentive: 0, saleAmt: 0, inflowCnt: 0, dateWorkFrom: today, dateWorkTo: today, saleTotalAmt: 110000, gubun: '05', mileageUseInd: false, useMileage: 0, custRate: 0.5, empRate: 1, existMileage: 0 });
  const st6 = await state(); const row3 = st6.settlement.find((x: any) => x.settlementSeq === r3.seq); T('선입금(05) 접수: 예상수수료 -100000, 입금예정 -110000', row3.expectRateAmt === '-100000' && row3.expectAmt === '-110000');
  const ap3 = await approve(r3.seq!, 123, '', 'u-admin'); T('선입금 승인: 입금=판매총액 110000 고정, 수수료 -110000', ap3.site?.confirmAmt === 110000 && ap3.site?.confirmRateAmt === -110000, JSON.stringify(ap3.site));
  // ---- 상품인센 상품 접수 ----
  const r4 = await createRequest('u-yong', { prodId: 'PD-0099', custId: '2222222222', prodAmt: 10, prodIncentive: 3, saleAmt: 0, inflowCnt: 100, dateWorkFrom: today, dateWorkTo: today, saleTotalAmt: 5000, gubun: '01', mileageUseInd: false, useMileage: 0, custRate: 0.5, empRate: 1, existMileage: 0 });
  const st7 = await state(); const row4 = st7.settlement.find((x: any) => x.settlementSeq === r4.seq); T('상품인센 상품: 인센율 0, 예상수수료 1×3×100=300', row4.incentiveRate === '0' && row4.expectRateAmt === '300' && row4.prodIncentiveInd === 'Y');
  // ---- 세션 만료 재로그인 ----
  const bad = await fetchApprovals('JSESSIONID=NOPE', today, today, '').catch(e => e.message); T('만료 세션 → 오류 메시지', typeof bad === 'string' && /세션|권한/.test(bad), String(bad));
  // ---- 결과 ----
  const pass = R.filter(x => x.ok).length; console.log(R.map(x => `${x.ok ? 'PASS' : 'FAIL'}  ${x.n}${x.note ? '  — ' + x.note : ''}`).join('\n')); console.log(`\n=== ${pass}/${R.length} ${pass === R.length ? '✓' : '✗'} ===`);
  const st = await state(); console.log('\n--- 사이트가 받은 요청 로그(일부) ---\n' + st.log.filter((l: string) => /POST/.test(l)).slice(0, 6).join('\n'));
  process.exit(pass === R.length ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
