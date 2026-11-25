// One row per inquiry: preferred branches and services must not multiply global counts.
export const verifiedInquiryConversion = `i.status='CONVERTED' AND EXISTS(SELECT 1 FROM inquiry_events verified WHERE verified.inquiry_id=i.id AND verified.new_status='CONVERTED' AND verified.type IN ('SERVICE_CONVERSION','RESERVATION_STATUS'))`;
export const verifiedInquiryReservation = `i.status='RESERVED' AND EXISTS(SELECT 1 FROM inquiry_events verified WHERE verified.inquiry_id=i.id AND verified.new_status='RESERVED' AND verified.type='RESERVATION_STATUS')`;
export const inquiryReportingSource = `SELECT i.branch_id,i.status,i.inquiry_date AS event_date,
  CASE WHEN ${verifiedInquiryConversion} THEN 1 ELSE 0 END::numeric AS amount,
  CASE WHEN i.status IN ('NEW','FOLLOW_UP','NO_RESPONSE') THEN 1 ELSE 0 END AS attention
  FROM inquiries i WHERE i.archived_at IS NULL`;
