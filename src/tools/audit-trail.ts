import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

/**
 * Suffolk: ConnectWise audit trail (GET /system/audittrail). Read-only.
 *
 * The audit trail is the change history ConnectWise shows on a record's
 * "Audit Trail" tab: who changed what, and when. For tickets that includes
 * status moves (e.g. Queued -> In Progress), which the ticket record itself
 * doesn't keep.
 */

interface AuditEntry {
  text?: string;
  enteredDate?: string;
  enteredBy?: string;
  auditType?: string;
  auditSubType?: string;
  auditSource?: string;
  [key: string]: unknown;
}

const MAX_PAGES = 20; // 20 x 1000 entries per record is far beyond any real ticket

async function fetchAuditTrail(
  client: CwManageClient,
  type: string,
  id: number,
): Promise<AuditEntry[]> {
  const all: AuditEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await client.get<AuditEntry[]>("/system/audittrail", {
      type,
      id,
      page,
      pageSize: 1000,
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 1000) break;
  }
  return all;
}

// Matches the quoted from/to values in status-change text such as
// "Status has been updated from 'Queued' to 'In Progress'". Wording varies by
// ConnectWise version, so the raw text is always returned alongside.
const QUOTED_FROM_TO = /from\s+["'‘“](.*?)["'’”]\s+to\s+["'‘“](.*?)["'’”]/i;

function isStatusChange(e: AuditEntry): boolean {
  const sub = (e.auditSubType ?? "").toLowerCase();
  const text = (e.text ?? "").toLowerCase();
  return sub.includes("status") || /\bstatus\b/.test(text);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function registerAuditTrailTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_get_audit_trail",
    "Get the ConnectWise audit trail (change history) for one record: who changed what and when, oldest first. Same data as the record's Audit Trail tab. 'type' is the ConnectWise record type, e.g. 'Ticket' (service and project tickets), 'Company', 'Contact', 'Configuration', 'Opportunity', 'Agreement', 'PurchaseOrder'.",
    {
      type: z.string().describe("ConnectWise record type, e.g. 'Ticket'"),
      id: z.number().describe("Record ID (e.g. the ticket number)"),
    },
    async ({ type, id }) => {
      const entries = await fetchAuditTrail(client, type, id);
      entries.sort((a, b) => String(a.enteredDate ?? "").localeCompare(String(b.enteredDate ?? "")));
      return {
        content: [{ type: "text", text: JSON.stringify({ type, id, count: entries.length, entries }, null, 2) }],
      };
    },
  );

  server.tool(
    "cw_get_ticket_status_history",
    "Get the status-change history for up to 50 tickets in one call, from the ConnectWise audit trail. For each ticket returns every status change (oldest first) with date, who made it, and from/to status when the audit text includes them, plus the raw audit text. Use it for time-in-status and response metrics, e.g. how long tickets sat in 'Queued' before moving to 'In Progress'. Get the ticket IDs first with cw_search_tickets.",
    {
      ticketIds: z.array(z.number()).min(1).max(50).describe("Ticket IDs (max 50 per call)"),
    },
    async ({ ticketIds }) => {
      const results = await mapLimit(ticketIds, 5, async (id) => {
        try {
          const entries = await fetchAuditTrail(client, "Ticket", id);
          const changes = entries
            .filter(isStatusChange)
            .map((e) => {
              const m = QUOTED_FROM_TO.exec(e.text ?? "");
              return {
                date: e.enteredDate,
                by: e.enteredBy,
                from: m?.[1] ?? null,
                to: m?.[2] ?? null,
                text: e.text,
              };
            })
            .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
          return { ticketId: id, statusChanges: changes };
        } catch (err) {
          return { ticketId: id, error: err instanceof Error ? err.message : String(err) };
        }
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
