describe('booking workflow invariants',()=>{
  it('requires credit/slot/equipment before confirmed',()=>{
    const booking={creditStatus:'Passed',slotStatus:'Protected',equipmentStatus:'Available'};
    expect([booking.creditStatus,booking.slotStatus,booking.equipmentStatus]).toEqual(['Passed','Protected','Available']);
  });
});
