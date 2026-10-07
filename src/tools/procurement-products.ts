import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

/**
 * Suffolk: product line items (ConnectWise /procurement/products).
 *
 * These are the products actually added to tickets, projects, opportunities,
 * sales orders and invoices -- with their own description, quantity, cost and
 * price -- as opposed to the catalog (/procurement/catalog), which is the list
 * of SKUs you *can* sell. Read-only.
 */
export function registerProcurementProductTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_search_products",
    "Search product line items (ConnectWise /procurement/products): products added to tickets, projects, opportunities, sales orders and invoices, with description, quantity, cost and price. Use 'conditions' for CW query syntax, e.g. \"ticket/id=12345\", \"invoice/id=678\", \"description like '%UPS%' and price > 200\", or \"catalogItem/identifier like 'APC%'\". Use 'fields' to return only the columns you need (e.g. \"id,description,quantity,cost,price,ticket,invoice,catalogItem\").",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      fields: z
        .string()
        .optional()
        .describe("Comma-separated fields to return (reduces payload size)"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by (e.g. 'id desc')"),
    },
    async ({ conditions, fields, page, pageSize, orderBy }) => {
      const result = await client.get("/procurement/products", {
        conditions,
        fields,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_product",
    "Get one product line item (ConnectWise /procurement/products/{id}) by ID.",
    {
      id: z.number().describe("Product line item ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/procurement/products/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
