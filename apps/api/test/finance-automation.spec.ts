import { canonicalPair, collectionPriority, liquidityStatus, paymentPriority, periodOf } from '../src/modules/finance-automation/finance-automation.policy';

describe('finance automation policy',()=>{
  it('prioritizes collections deterministically',()=>{expect(collectionPriority(65,'ISSUED',false).priority).toBe('CRITICAL');expect(collectionPriority(10,'ISSUED',false).priority).toBe('MEDIUM');});
  it('scores urgent AP above later AP',()=>{expect(paymentPriority(-5,1000)).toBeGreaterThan(paymentPriority(25,1000));});
  it('classifies liquidity',()=>{expect(liquidityStatus(-200,100,50)).toBe('BREACH');expect(liquidityStatus(50,100,500)).toBe('LOW');expect(liquidityStatus(200,100,0)).toBe('OK');});
  it('normalizes periods and entity pairs',()=>{expect(periodOf('2026-09-18')).toBe('2026-09');expect(canonicalPair('B','A')).toEqual(['A','B']);});
});
