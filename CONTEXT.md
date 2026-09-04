# Shipping Advice Confirmed — Auto Email

The domain around automatically emailing an internal notification when a Shipping Advice is confirmed, the per-Sales-Channel routing of that email, and the manual Resend action for redelivery.

## Language

**Shipping Advice (SA)**:
A Sales Order sitting in a confirmed shipping status; it is the transaction whose confirmation triggers the notification email. It is not a separate record type — it is a Sales Order.
_Avoid_: SA document, delivery order

**Confirm (a Shipping Advice)**:
The user action that finalizes the SA and fires the notification email on first confirm. Guarded by `custbody_sa_email_sent` so it never re-fires on a later click — that guard is distinct from, and unaffected by, Resend.
_Avoid_: submit, approve, post

**Resend (a Shipping Advice email)**:
A separate, manual user action — available only after a Shipping Advice has already been confirmed and emailed (`custbody_sa_email_sent = true`) — that re-sends the notification email on demand. Exists to recover from delivery failures the system cannot detect itself (e.g. the message was lost, or blocked by the recipient's mail security) since NetSuite's `email.send()` reports success once handed off, regardless of what happens downstream. Always uses the SA's current data and the Sales Channel's current SA Email Setup recipients at send time — never a snapshot from the original Confirm. Unlimited uses; each attempt shows a pass/fail banner on the transaction. Does not touch SA status or any of the Confirm-time field updates other than re-stamping `custbody_sa_email_sent_date` to the latest send time — the field now means "last sent (first send or a resend)", not "first sent"; the full history of every send/resend lives only in the transaction's Messages tab, not in a dedicated field or record.
_Avoid_: retry, re-confirm, re-trigger

**Sales Channel**:
The single business channel a Shipping Advice belongs to, held on the SA header custom segment `cseg_sale_channel`. Mandatory — every SA has exactly one Sales Channel.
_Avoid_: source, division, segment

**SA Email Setup**:
A shared email profile record (`customrecord_sa_email_setup`) — one Sender and one Recipients list — applied to one or more Sales Channels via a multi-select field. Replaces the old global hard-coded sender and recipient search. A given Sales Channel should appear in at most one active setup.
_Avoid_: config, mapping table, per-channel record

**Recipients**:
The set of email addresses notified when an SA in a given Sales Channel is confirmed. Stored on the SA Email Setup as free text, one address per line; recipients need not be employees.
_Avoid_: to-list, subscribers

**Sender**:
The party the notification email is sent from for a given Sales Channel (resolved in Q4).
_Avoid_: from, author
