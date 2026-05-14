import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STEPFUN_API_KEY = Deno.env.get("STEPFUN_API_KEY");
const STEPFUN_BASE_URL = Deno.env.get("STEPFUN_BASE_URL") || "https://api.stepfun.com/v1";
const MODEL = Deno.env.get("HERMES_MODEL") || "step-3.5-flash";

if (!STEPFUN_API_KEY) {
  throw new Error("STEPFUN_API_KEY environment variable is required");
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABE_SERVICE_ROLE_KEY")!);

const guestTools = [
  {
    type: "function",
    function: {
      name: "query_menu_items",
      description: "Search the menu for items by name, category, or ingredients",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: 'Search term (e.g. "salad", "vegan", "prawn")' },
          category: {
            type: "string",
            enum: ["food", "drink", "appetizer", "main", "dessert"],
            description: "Filter by menu category",
          },
          department: {
            type: "string",
            enum: ["kitchen", "bar", "both"],
            description: "Filter by preparation department",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description: "Get the status of the current guest's recent orders",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_tour_booking",
      description: "Book a tour for the guest",
      parameters: {
        type: "object",
        properties: {
          tour_name: { type: "string", description: "Name of the tour (from tours_config)" },
          tour_date: { type: "string", format: "date", description: "YYYY-MM-DD" },
          pax: { type: "integer", description: "Number of passengers" },
          pickup_time: { type: "string", description: 'Optional pickup time (e.g. "07:00")' },
        },
        required: ["tour_name", "tour_date", "pax"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_guest_request",
      description: "Submit a service request (towels, housekeeping, maintenance, etc.)",
      parameters: {
        type: "object",
        properties: {
          request_type: {
            type: "string",
            description: 'Type of request (e.g. "Housekeeping", "Maintenance", "Towel Request")',
          },
          details: { type: "string", description: "Additional details" },
        },
        required: ["request_type", "details"],
      },
    },
  },
];

const adminTools = [
  ...guestTools.slice(0, 2),
  {
    type: "function",
    function: {
      name: "query_orders",
      description: "Query orders with optional filters",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["New", "Preparing", "Served", "Paid", "Closed"],
            description: "Filter by order status",
          },
          limit: { type: "integer", description: "Max results (default 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_items",
      description: "Get inventory items below stock threshold",
      parameters: {
        type: "object",
        properties: {
          threshold_percent: { type: "number", description: "Percentage threshold (default 20%)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate operational or financial report",
      parameters: {
        type: "object",
        properties: {
          report_type: {
            type: "string",
            enum: ["daily", "monthly", "financial", "orders", "inventory"],
            description: "Type of report",
          },
          date: { type: "string", format: "date", description: "Date for report (YYYY-MM-DD), defaults to today" },
        },
        required: ["report_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_telegram_notification",
      description: "Send a Telegram message to a staff group",
      parameters: {
        type: "object",
        properties: {
          group: { type: "string", enum: ["kitchen", "bar", "managers", "all"], description: "Target group" },
          message: { type: "string", description: "Message text" },
        },
        required: ["group", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_order_status",
      description: "Update status of an order (department-specific or overall)",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order UUID" },
          department: { type: "string", enum: ["kitchen", "bar"], description: "Which department status to update" },
          new_status: { type: "string", enum: ["pending", "preparing", "ready"], description: "New status" },
        },
        required: ["order_id", "department", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_tour_booking",
      description: "Confirm a tour booking and optionally charge to guest room",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "Tour booking UUID" },
        },
        required: ["booking_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_requests",
      description: "Get pending guest service requests",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_today_stats",
      description: "Get today's operational stats (orders, revenue, occupancy, pending tasks)",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function queryMenuItems(args: any): Promise<any> {
  let query = supabase.from("menu_items").select("*").eq("available", true);
  if (args.query) query = query.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
  if (args.category) query = query.eq("category", args.category);
  if (args.department) {
    query =
      args.department === "both"
        ? query.in("department", ["kitchen", "bar", "both"])
        : query.eq("department", args.department);
  }
  const { data } = await query.limit(20);
  return { items: data };
}

async function getOrderStatus(args: any, employeeId?: string, guestSession?: any): Promise<any> {
  if (employeeId) {
    const { data } = await supabase
      .from("orders")
      .select("id, order_type, location_detail, guest_name, total, status, created_at")
      .in("status", ["New", "Preparing", "Served"])
      .order("created_at", { ascending: false })
      .limit(10);
    return { orders: data };
  } else if (guestSession?.room_name) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("location_detail", guestSession.room_name)
      .order("created_at", { ascending: false })
      .limit(5);
    return { orders: data };
  }
  return { orders: [] };
}

async function createTourBooking(args: any, guestSession: any): Promise<any> {
  const { data: tourConfig } = await supabase
    .from("tours_config")
    .select("*")
    .ilike("name", args.tour_name)
    .limit(1)
    .maybeSingle();
  if (!tourConfig || !tourConfig.active) {
    return { error: `Tour "${args.tour_name}" not found or inactive` };
  }
  const { data: booking, error } = await supabase
    .from("tour_bookings")
    .insert({
      tour_name: tourConfig.name,
      tour_date: args.tour_date,
      pax: args.pax,
      pickup_time: args.pickup_time || null,
      unit_name: guestSession.room_name,
      booking_id: guestSession.booking_id,
      guest_name: guestSession.guest_name,
      status: "pending",
      price: tourConfig.price,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { booking };
}

async function submitGuestRequest(args: any, guestSession: any): Promise<any> {
  const { data, error } = await supabase
    .from("guest_requests")
    .insert({
      guest_name: guestSession.guest_name,
      room_id: guestSession.room_id,
      booking_id: guestSession.booking_id,
      request_type: args.request_type,
      details: args.details,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  await supabase.functions.invoke("send-telegram", {
    body: {
      group: "managers",
      message: `🔔 Guest Request: ${args.request_type} — Room ${guestSession.room_name}: ${args.details}`,
    },
  });
  return { request: data };
}

async function queryOrdersAdmin(args: any): Promise<any> {
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(args.limit || 10);
  if (args.status) query = query.eq("status", args.status);
  const { data } = await query;
  return { orders: data };
}

async function getLowStockItems(args: any): Promise<any> {
  const threshold_percent = args.threshold_percent || 20;
  const { data } = await supabase.from("ingredients").select("*").lte("current_stock", 10);
  return { low_stock: data };
}

async function generateReport(args: any): Promise<any> {
  const today = new Date();
  let targetDate: string;
  if (args.date) {
    targetDate = args.date;
  } else if (args.report_type === "monthly") {
    targetDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  } else {
    targetDate = today.toISOString().split("T")[0];
  }
  const start = `${targetDate}T00:00:00`;
  const end = `${targetDate}T23:59:59`;

  const [ordersCountRes, revenueRes, toursRes, expensesRes] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
    supabase.from("orders").select("sum(total) as sum").gte("created_at", start).lte("created_at", end),
    supabase.from("tour_bookings").select("sum(price) as sum").eq("tour_date", targetDate),
    supabase.from("resort_ops_expenses").select("sum(amount) as sum").eq("expense_date", targetDate),
  ]);

  const revenue = revenueRes.data?.[0]?.sum || 0;
  const toursRevenue = toursRes.data?.[0]?.sum || 0;
  const expenses = expensesRes.data?.[0]?.sum || 0;

  return {
    report_type: args.report_type,
    date: targetDate,
    total_orders: ordersCountRes.count || 0,
    revenue,
    tours_revenue: toursRevenue,
    expenses,
    net_income: revenue + toursRevenue - expenses,
  };
}

async function sendTelegramNotification(args: any): Promise<any> {
  await supabase.functions.invoke("send-telegram", {
    body: { group: args.group, message: args.message },
  });
  return { success: true };
}

async function updateOrderStatus(args: any): Promise<any> {
  const updateData: any = {};
  if (args.department === "kitchen") updateData.kitchen_status = args.new_status;
  else if (args.department === "bar") updateData.bar_status = args.new_status;
  else return { error: "Invalid department" };

  if (args.new_status === "ready") {
    const order = await supabase.from("orders").select("bar_status, kitchen_status").eq("id", args.order_id).single();
    const otherField = args.department === "kitchen" ? "bar_status" : "kitchen_status";
    if (order.data && order.data[otherField] === "ready") {
      updateData.status = "Served";
    }
  }

  const { error } = await supabase.from("orders").update(updateData).eq("id", args.order_id);
  if (error) return { error: error.message };
  return { success: true };
}

async function confirmTourBooking(args: any): Promise<any> {
  const { data: booking } = await supabase.from("tour_bookings").select("*").eq("id", args.booking_id).single();
  if (!booking) return { error: "Booking not found" };

  const updates: any = { status: "confirmed", confirmed_by: "Hermes Admin" };
  if (booking.price > 0 && booking.unit_name) {
    const { data: unit } = await supabase
      .from("units")
      .select("id")
      .eq("unit_name", booking.unit_name)
      .limit(1)
      .single();
    if (unit) {
      await supabase.from("room_transactions").insert({
        unit_id: unit.id,
        unit_name: booking.unit_name,
        booking_id: booking.booking_id,
        guest_name: booking.guest_name,
        transaction_type: "charge",
        amount: booking.price,
        tax_amount: 0,
        service_charge_amount: 0,
        total_amount: booking.price,
        payment_method: "Charge to Room",
        staff_name: "Hermes Admin",
        notes: `Tour: ${booking.tour_name} (${booking.pax} pax) on ${booking.tour_date}`,
      });
    }
  }
  const { error } = await supabase.from("tour_bookings").update(updates).eq("id", args.booking_id);
  if (error) return { error: error.message };
  return { booking: { ...booking, ...updates } };
}

async function getPendingRequests(): Promise<any> {
  const { data } = await supabase
    .from("guest_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  return { requests: data };
}

async function getTodayStats(): Promise<any> {
  const today = new Date().toISOString().split("T")[0];
  const start = `${today}T00:00:00`;
  const end = `${today}T23:59:59`;

  const [ordersCountRes, revenueRes, newOrdersRes, lowStockRes, pendingReqsRes, hkPendingRes] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }).gte("created_at", start).lte("created_at", end),
    supabase.from("orders").select("sum(total) as sum").gte("created_at", start).lte("created_at", end),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "New"),
    supabase.from("ingredients").select("*").lte("current_stock", 10),
    supabase.from("guest_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("housekeeping_orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "accepted", "cleaning"]),
  ]);

  const revenue = revenueRes.data?.[0]?.sum || 0;
  return {
    date: today,
    total_orders: ordersCountRes.count || 0,
    revenue,
    new_orders: newOrdersRes.count || 0,
    low_stock_items: lowStockRes.data?.length || 0,
    pending_requests: pendingReqsRes.count || 0,
    housekeeping_tasks: hkPendingRes.count || 0,
  };
}

function buildSystemPrompt(role: string, context: any = {}): string {
  if (role === "guest") {
    return `You are Hermes, the AI concierge for BAIA Resort in San Vicente, Palawan.
Guests may ask about the menu, order food/drinks, book tours, request services, or ask about their stay.
Be friendly, concise, and helpful. Use the available tools to look up information or perform actions.
Never make up menu items or prices — only use what's in the database.
If a guest wants to order, guide them to use the menu or take their request directly.
If they ask about their bill, check their order history.
Always confirm details before booking tours or creating requests.
`;
  } else if (role === "admin") {
    return `You are Hermes Ops Assistant for BAIA Resort. You help managers and staff with daily operations.
You have access to real-time data: orders, inventory, guest requests, tours, housekeeping, and revenue.
Your job is to:
- Answer questions about current operations
- Provide insights and alerts (low stock, big spenders, delayed orders)
- Generate reports on demand
- Execute quick actions (update order status, send Telegram messages, confirm bookings)
- Surface proactive recommendations

Guidelines:
* Be concise and action-oriented.
* When showing data, summarize key points first.
* For actions that change state, confirm before executing.
* Use tools to fetch live data; do not guess numbers.
* If you detect an anomaly (e.g., low stock, large order), highlight it proactively.

Current snapshot:
${JSON.stringify(context, null, 2)}`;
  }
  return `You are Hermes, a helpful assistant.`;
}

async function executeTool(toolName: string, args: any, roleData: any): Promise<any> {
  switch (toolName) {
    case "query_menu_items":
      return await queryMenuItems(args);
    case "get_order_status":
      return await getOrderStatus(args, roleData.employeeId, roleData.session);
    case "create_tour_booking":
      return await createTourBooking(args, roleData.session);
    case "submit_guest_request":
      return await submitGuestRequest(args, roleData.session);
    case "query_orders":
      return await queryOrdersAdmin(args);
    case "get_low_stock_items":
      return await getLowStockItems(args);
    case "generate_report":
      return await generateReport(args);
    case "send_telegram_notification":
      return await sendTelegramNotification(args);
    case "update_order_status":
      return await updateOrderStatus(args);
    case "confirm_tour_booking":
      return await confirmTourBooking(args);
    case "get_pending_requests":
      return await getPendingRequests();
    case "get_today_stats":
      return await getTodayStats();
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { message, role = "guest", session, context = {}, conversationHistory = [] } = await req.json();

    if (!["guest", "admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role === "admin") {
      if (!session?.employeeId || session.isAdmin !== true) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (!session?.booking_id || !session?.room_name) {
        return new Response(JSON.stringify({ error: "Guest session incomplete" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let systemContext = context;
    if (role === "admin" && (!systemContext || Object.keys(systemContext).length === 0)) {
      try {
        systemContext = { today_stats: await getTodayStats() };
      } catch (e) {
        systemContext = {};
      }
    }

    const systemPrompt = buildSystemPrompt(role, systemContext);
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: "user", content: message },
    ];

    const tools = role === "admin" ? adminTools : guestTools;

    const response = await fetch("https://api.stepfun.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STEPFUN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`StepFun API error: ${response.status} ${err}`);
    }

    const result = await response.json();
    let assistantMessage = result.choices[0].message;
    let finalReply = assistantMessage.content;
    let toolCalls = assistantMessage.tool_calls;

    while (toolCalls && toolCalls.length > 0) {
      messages.push(assistantMessage);
      for (const toolCall of toolCalls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments);
        try {
          const toolResult = await executeTool(fnName, fnArgs, {
            employeeId: session?.employeeId,
            session: session,
          });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        } catch (err: any) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: err.message || "Tool execution failed" }),
          });
        }
      }

      const secondResp = await fetch("https://api.stepfun.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STEPFUN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: "auto",
        }),
      });
      const secondResult = await secondResp.json();
      assistantMessage = secondResult.choices[0].message;
      finalReply = assistantMessage.content;
      toolCalls = assistantMessage.tool_calls;
    }

    return new Response(JSON.stringify({ reply: finalReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Hermes Edge Function error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
