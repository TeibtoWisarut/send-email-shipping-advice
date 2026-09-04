# SA Email Setup groups multiple Sales Channels per record

The per-channel email routing config (`customrecord_sa_email_setup`) links Sales Channels through a **multi-select** field rather than one record per channel, because at launch every channel shares the same sender and recipients — a shared profile keeps that DRY and lets a channel be split out later without a schema change. The trade-off: NetSuite cannot enforce that a channel appears in only one record, so the send-time lookup ("find the active setup whose channel list contains this SA's `cseg_sale_channel`") may match more than one. When it does, the script uses the **first match and writes `log.error`** (chosen over refusing to send) so the email still goes out while leaving a trail to fix the duplicate config.

## Considered Options

- **One record per channel, channel as unique key** — native uniqueness, but duplicates config when many channels share one email set, and every channel must be maintained individually.
- **Multi-select grouping (chosen)** — one shared profile covers many channels; requires script-side handling of accidental overlap.
