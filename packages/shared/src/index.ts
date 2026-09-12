export const BOOKING_STATUSES = [
  'DRAFT','RATE_REQUESTED','RATE_RECEIVED','RATE_APPROVED','QUOTE_SENT','CUSTOMER_ACCEPTED',
  'BOOKING_REQUESTED','CREDIT_CHECK','EQUIPMENT_CHECK','SLOT_CHECK','AGENT_ACCEPTANCE',
  'CARRIER_CONFIRMATION','FINAL_APPROVAL','CONFIRMED','OPERATIONAL','COMPLETED','FINANCIALLY_CLOSED'
] as const;

export const SYSTEM_DOMAINS = {
  erp: 'erp.ancline.net',
  control: 'control.ancline.net',
  portal: 'portal.ancline.net',
  agent: 'agent.ancline.net',
  api: 'api.ancline.net'
} as const;
