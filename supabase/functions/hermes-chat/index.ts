import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const HERMES_MODEL = Deno.env.get('HERMES_MODEL') || 'google/gemini-2.5-flash';

function buildSystemPrompt(context: {
  guestName: string;
  roomName: string;
  checkOut: string;
  recentOrders: Array<{ id: string; total: number; status: string }>;
  resortProfile: any;
  menuCategories: string[];
}) {
  const { guestName, roomName, checkOut, recentOrders, resortProfile, menuCategories } = context;
  const ordersSummary = recentOrders.length
    ? recentOrders.map((o: any) => `#${o.id} (${o.status}): ₱${o.total}`).join(', ')
    : 'No recent orders';
  return `You are Hermes, the AI concierge for ${resortProfile?.resort_name || 'BAIA Resort'} in San Vicente, Palawan.

Your job: Help guests with menu questions, order status, tour bookings, service requests, and resort info.
- Be friendly, concise, and helpful (max 2-3 sentences unless detailed info needed).
- Only use information from the database. Never invent menu items or policies.
- When guest asks to DO something (book, request, order), immediately use the appropriate tool — don't just describe it.
- If a tool returns an error or no data, explain clearly and suggest alternatives.

Guest: ${guestName}
Room: ${roomName}
Check-out: ${new Date(checkOut).toLocaleDateString()}
Recent orders: ${ordersSummary}

Resort policies:
- WiFi: ${resortProfile?.wifi_ssid || 'BAIA-Guest'}, password: ${resortProfile?.wifi_password || 'welcome'}
- Checkout time: ${resortProfile?.checkout_time || '11:00 AM'}
- Front desk: ${resortProfile?.contact_phone || 'N/A'}
- Address: ${resortProfile?.address || 'San Vicente, Palawan'}

Available menu categories: ${menuCategories.join(', ') || 'Not available'}

TOOLS AVAILABLE:
- query_menu_items: Search menu by category or keyword
- get_order_status: Get recent orders (no args)
- create_tour_booking: Book a tour (requires tour_name, date, pax)
- submit_guest_request: Create service request (requires request_type: housekeeping/maintenance/frontdesk/other, details)
- get_resort_info: Get resort policies/contact

If the guest asks "What's on the menu?" → call query_menu_items immediately.
If they say "I want to book X" → call create_tour_booking.
If they say "I need towels" → call submit_guest_request.
If they ask "Where's my order?" → call get_order_status.
If they ask about WiFi/checkout → call get_resort_info.`;
}

function buildAdminSystemPrompt(context: {
  todayOrders: number;
  todayRevenue: number;
  newOrders: number;
  lowStockItems: number;
  pendingRequests: number;
  housekeepingTasks: number;
}) {
  const { todayOrders, todayRevenue, newOrders, lowStockItems, pendingRequests, housekeepingTasks } = context;
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
* Highlight anomalies proactively.

Current live snapshot:
- Today\'s orders: ${todayOrders}
- Today\'s revenue: ₱${todayRevenue.toLocaleString()}
- New orders pending: ${newOrders}
- Low stock items: ${lowStockItems}
- Pending guest requests: ${pendingRequests}
- Housekeeping tasks: ${housekeepingTasks}

TOOLS AVAILABLE (call them as needed):
- query_menu_items: Search menu (category, keyword)
- get_order_status: Recent orders (all rooms)
- query_orders: Filter orders by status
- get_low_stock_items: Inventory below threshold
- generate_report: daily/monthly/financial/orders/inventory report
- send_telegram_notification: Notify staff group (kitchen/bar/managers/all)
- update_order_status: Mark order as pending/preparing/ready (department specific)
- confirm_tour_booking: Confirm booking and charge room if needed
- get_pending_requests: Guest service requests awaiting action
- get_today_stats: Refresh current stats`;
}

const GUEST_TOOLS = [
  { type: 'function', function: { name: 'query_menu_items', description: 'Search menu items by category or keyword.', parameters: { type: 'object', properties: { category: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number', default: 10 } } } } },
  { type: 'function', function: { name: 'get_order_status', description: 'Get recent orders for this guest.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'create_tour_booking', description: 'Book a tour. Requires tour_name, date (YYYY-MM-DD), pax.', parameters: { type: 'object', properties: { tour_name: { type: 'string' }, date: { type: 'string', format: 'date' }, pax: { type: 'number' }, notes: { type: 'string' } }, required: ['tour_name', 'date', 'pax'] } } },
  { type: 'function', function: { name: 'submit_guest_request', description: 'Create service request (housekeeping/maintenance/frontdesk/other).', parameters: { type: 'object', properties: { request_type: { type: 'string', enum: ['housekeeping','maintenance','frontdesk','other'] }, details: { type: 'string' } }, required: ['request_type','details'] } } },
  { type: 'function', function: { name: 'get_resort_info', description: 'Get resort policies.', parameters: { type: 'object', properties: {} } } }
];

const ADMIN_TOOLS = [
  ...GUEST_TOOLS.slice(0, 2),
  { type: 'function', function: { name: 'query_orders', description: 'Query orders with optional status filter and limit.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['New','Preparing','Served','Paid','Closed'] }, limit: { type: 'number', default: 10, maximum: 50 } } } } },
  { type: 'function', function: { name: 'get_low_stock_items', description: 'Get items with stock at or below threshold.', parameters: { type: 'object', properties: { threshold: { type: 'number', default: 10 } } } } },
  { type: 'function', function: { name: 'generate_report', description: 'Generate report (daily/monthly/financial/orders/inventory).', parameters: { type: 'object', properties: { report_type: { type: 'string', enum: ['daily','monthly','financial','orders','inventory'], default: 'daily' }, date: { type: 'string', format: 'date' } } } } },
  { type: 'function', function: { name: 'send_telegram_notification', description: 'Send Telegram message to staff group.', parameters: { type: 'object', properties: { group: { type: 'string', enum: ['kitchen','bar','managers','all'] }, message: { type: 'string' } }, required: ['group','message'] } } },
  { type: 'function', function: { name: 'update_order_status', description: 'Update order status by department (kitchen/bar, pending/preparing/ready).', parameters: { type: 'object', properties: { order_id: { type: 'string' }, department: { type: 'string', enum: ['kitchen','bar'] }, new_status: { type: 'string', enum: ['pending','preparing','ready'] } }, required: ['order_id','department','new_status'] } } },
  { type: 'function', function: { name: 'confirm_tour_booking', description: 'Confirm booking and charge room if needed.', parameters: { type: 'object', properties: { booking_id: { type: 'string' } }, required: ['booking_id'] } } },
  { type: 'function', function: { name: 'get_pending_requests', description: 'Get pending guest service requests.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_today_stats', description: 'Get today operational metrics.', parameters: { type: 'object', properties: {} } } }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { message, conversationHistory = [], guestSession, staffSession, role = 'guest' } = await req.json();
    const sb = getSupabaseAdmin();

    if (role === 'guest') {
      if (!guestSession?.booking_id || !guestSession?.room_id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const [guestRes, ordersRes, profileRes, categoriesRes] = await Promise.all([
        sb.from('resort_ops_guests').select('full_name').eq('booking_id', guestSession.booking_id).single(),
        sb.from('orders').select('id, total, status, created_at').eq('room_id', guestSession.room_id).order('created_at', { ascending: false }).limit(3),
        sb.from('resort_profile').select('*').single(),
        sb.from('menu_categories').select('name').eq('active', true)
      ]);

      const systemPrompt = buildSystemPrompt({
        guestName: guestRes.data?.full_name || 'Guest',
        roomName: guestSession.room_name,
        checkOut: guestSession.check_out,
        recentOrders: ordersRes.data || [],
        resortProfile: profileRes.data,
        menuCategories: categoriesRes.data?.map((c: any) => c.name) || []
      });

      const messages: any[] = [{ role: 'system', content: systemPrompt }, ...conversationHistory.slice(-10), { role: 'user', content: message }];

      const ai_resp = await fetch(AI_GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: HERMES_MODEL, messages, tools: GUEST_TOOLS, tool_choice: 'auto' })
      });
      if (!ai_resp.ok) {
        const err = await ai_resp.text();
        if (ai_resp.status === 429) return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        if (ai_resp.status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        throw new Error(`AI gateway ${ai_resp.status}: ${err}`);
      }
      const result = await ai_resp.json();
      let reply = result.choices[0].message.content || '';
      const toolCalls = result.choices[0].message.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        messages.push(result.choices[0].message);
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall.function;
          let toolResult: string;
          try {
            toolResult = await executeTool(name, args, { sb, guestSession, orders: ordersRes.data || [], resortProfile: profileRes.data });
          } catch (err: any) {
            toolResult = JSON.stringify({ error: err.message });
          }
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
        }
        const followup = await fetch(AI_GATEWAY_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: HERMES_MODEL, messages })
        });
        if (!followup.ok) throw new Error(`AI gateway follow-up error: ${followup.status}`);
        const followupJson = await followup.json();
        reply = followupJson.choices[0].message.content || '';
      }
      return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } else if (role === 'admin') {
      if (!staffSession?.employeeId || staffSession.isAdmin !== true) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const today = new Date().toISOString().split('T')[0];
      const start = `${today}T00:00:00`;
      const end = `${today}T23:59:59`;
      const [
        ordersCountRes,
        revenueRes,
        newOrdersRes,
        lowStockRes,
        pendingReqsRes,
        hkPendingRes
      ] = await Promise.all([
        sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
        sb.from('orders').select('sum(total) as sum').gte('created_at', start).lte('created_at', end),
        sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'New'),
        sb.from('ingredients').select('*').lte('current_stock', 10),
        sb.from('guest_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('housekeeping_orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'accepted', 'cleaning'])
      ]);

      const adminContext = {
        todayOrders: ordersCountRes.count || 0,
        todayRevenue: revenueRes.data?.[0]?.sum || 0,
        newOrders: newOrdersRes.count || 0,
        lowStockItems: lowStockRes.data?.length || 0,
        pendingRequests: pendingReqsRes.count || 0,
        housekeepingTasks: hkPendingRes.count || 0
      };

      const systemPrompt = buildAdminSystemPrompt(adminContext);
      const messages: any[] = [{ role: 'system', content: systemPrompt }, ...conversationHistory.slice(-10), { role: 'user', content: message }];

      const ai_resp = await fetch(AI_GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: HERMES_MODEL, messages, tools: ADMIN_TOOLS, tool_choice: 'auto' })
      });
      if (!ai_resp.ok) {
        const err = await ai_resp.text();
        throw new Error(`AI gateway ${ai_resp.status}: ${err}`);
      }
      const result = await ai_resp.json();
      let reply = result.choices[0].message.content || '';
      const toolCalls = result.choices[0].message.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        messages.push(result.choices[0].message);
        for (const toolCall of toolCalls) {
          const { name, arguments: args } = toolCall.function;
          let toolResult: string;
          try {
            toolResult = await executeAdminTool(name, args, { sb, staffSession, context: adminContext });
          } catch (err: any) {
            toolResult = JSON.stringify({ error: err.message });
          }
          messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
        }
        const followup = await fetch(AI_GATEWAY_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: HERMES_MODEL, messages })
        });
        if (!followup.ok) throw new Error(`AI gateway follow-up error: ${followup.status}`);
        const followupJson = await followup.json();
        reply = followupJson.choices[0].message.content || '';
      }

      return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

  } catch (error: any) {
    console.error('Hermes chat error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', message: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});

async function executeTool(name: string, argsString: string, ctx: { sb: any; guestSession: any; orders: any[]; resortProfile: any; }): Promise<string> {
  const args = JSON.parse(argsString);
  switch (name) {
    case 'query_menu_items': {
      let query = ctx.sb.from('menu_items').select('*').eq('available', true);
      if (args.category) query = query.ilike('category', `%${args.category}%`);
      if (args.query) query = query.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
      if (args.limit) query = query.limit(args.limit);
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify(data || []);
    }
    case 'get_order_status': return JSON.stringify(ctx.orders);
    case 'create_tour_booking': {
      const { tour_name, date, pax, notes } = args;
      const { data: tourConfig } = await ctx.sb.from('tours_config').select('id, tour_name').ilike('tour_name', `%${tour_name}%`).limit(1);
      if (!tourConfig || tourConfig.length === 0) return JSON.stringify({ error: `Tour "${tour_name}" not found.` });
      const { data, error } = await ctx.sb.from('tour_bookings').insert({
        booking_id: ctx.guestSession.booking_id,
        guest_name: ctx.guestSession.guest_name || 'Guest',
        room_id: ctx.guestSession.room_id,
        tour_name, date, pax, notes: notes || '', status: 'pending'
      }).select();
      if (error) throw error;
      return JSON.stringify({ success: true, booking: data[0] });
    }
    case 'submit_guest_request': {
      const { request_type, details } = args;
      const { data, error } = await ctx.sb.from('guest_requests').insert({
        booking_id: ctx.guestSession.booking_id,
        room_id: ctx.guestSession.room_id,
        guest_name: ctx.guestSession.guest_name || 'Guest',
        request_type, details, status: 'new'
      }).select();
      if (error) throw error;
      return JSON.stringify({ success: true, request: data[0] });
    }
    case 'get_resort_info': {
      const profile = ctx.resortProfile;
      return JSON.stringify({
        wifi_ssid: profile?.wifi_ssid || 'BAIA-Guest',
        wifi_password: profile?.wifi_password || 'welcome',
        checkout_time: profile?.checkout_time || '11:00 AM',
        front_desk_phone: profile?.contact_phone || 'Contact front desk',
        address: profile?.address || 'San Vicente, Palawan'
      });
    }
    default: return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function executeAdminTool(name: string, argsString: string, ctx: { sb: any; staffSession: any; context: any; }): Promise<string> {
  const args = JSON.parse(argsString);
  switch (name) {
    case 'query_menu_items': {
      let query = ctx.sb.from('menu_items').select('*').eq('available', true);
      if (args.category) query = query.ilike('category', `%${args.category}%`);
      if (args.query) query = query.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
      if (args.limit) query = query.limit(args.limit);
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify(data || []);
    }
    case 'get_order_status': {
      const { data } = await ctx.sb.from('orders').select('id, order_type, location_detail, guest_name, total, status, created_at').in('status', ['New', 'Preparing', 'Served']).order('created_at', { ascending: false }).limit(10);
      return JSON.stringify({ orders: data || [] });
    }
    case 'query_orders': {
      let query = ctx.sb.from('orders').select('*').order('created_at', { ascending: false }).limit(args.limit || 10);
      if (args.status) query = query.eq('status', args.status);
      const { data, error } = await query;
      if (error) throw error;
      return JSON.stringify({ orders: data || [] });
    }
    case 'get_low_stock_items': {
      const { data, error } = await ctx.sb.from('ingredients').select('*').lte('current_stock', args.threshold || 10).limit(50);
      if (error) throw error;
      return JSON.stringify({ low_stock: data || [] });
    }
    case 'generate_report': {
      const today = new Date();
      let targetDate = args.date || (args.report_type === 'monthly' ? `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01` : today.toISOString().split('T')[0]);
      const start = `${targetDate}T00:00:00`, end = `${targetDate}T23:59:59`;
      const [ordersCountRes, revenueRes, toursRes, expensesRes] = await Promise.all([
        ctx.sb.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
        ctx.sb.from('orders').select('sum(total) as sum').gte('created_at', start).lte('created_at', end),
        ctx.sb.from('tour_bookings').select('sum(price) as sum').eq('tour_date', targetDate),
        ctx.sb.from('resort_ops_expenses').select('sum(amount) as sum').eq('expense_date', targetDate)
      ]);
      const revenue = revenueRes.data?.[0]?.sum || 0;
      return JSON.stringify({
        report_type: args.report_type,
        date: targetDate,
        total_orders: ordersCountRes.count || 0,
        revenue,
        tours_revenue: toursRes.data?.[0]?.sum || 0,
        expenses: expensesRes.data?.[0]?.sum || 0,
        net_income: revenue + (toursRes.data?.[0]?.sum || 0) - (expensesRes.data?.[0]?.sum || 0)
      });
    }
    case 'send_telegram_notification': {
      await ctx.sb.functions.invoke('send-telegram', { body: { group: args.group, message: args.message } });
      return JSON.stringify({ success: true });
    }
    case 'update_order_status': {
      const updateData: any = {};
      if (args.department === 'kitchen') updateData.kitchen_status = args.new_status;
      else if (args.department === 'bar') updateData.bar_status = args.new_status;
      else return JSON.stringify({ error: 'Invalid department' });
      if (args.new_status === 'ready') {
        const order = await ctx.sb.from('orders').select('bar_status, kitchen_status').eq('id', args.order_id).single();
        const other = args.department === 'kitchen' ? 'bar_status' : 'kitchen_status';
        if (order.data && order.data[other] === 'ready') updateData.status = 'Served';
      }
      const { error } = await ctx.sb.from('orders').update(updateData).eq('id', args.order_id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ success: true, order_id: args.order_id, updates: updateData });
    }
    case 'confirm_tour_booking': {
      const { data: booking } = await ctx.sb.from('tour_bookings').select('*').eq('id', args.booking_id).single();
      if (!booking) return JSON.stringify({ error: 'Booking not found' });
      const updates: any = { status: 'confirmed', confirmed_by: 'Hermes Admin' };
      if (booking.price > 0 && booking.unit_name) {
        const { data: unit } = await ctx.sb.from('units').select('id').eq('unit_name', booking.unit_name).limit(1).maybeSingle();
        if (unit) {
          await ctx.sb.from('room_transactions').insert({
            unit_id: unit.id, unit_name: booking.unit_name, booking_id: booking.booking_id,
            guest_name: booking.guest_name, transaction_type: 'charge', amount: booking.price,
            tax_amount: 0, service_charge_amount: 0, total_amount: booking.price,
            payment_method: 'Charge to Room', staff_name: 'Hermes Admin',
            notes: `Tour: ${booking.tour_name} (${booking.pax} pax) on ${booking.tour_date}`
          });
        }
      }
      const { error } = await ctx.sb.from('tour_bookings').update(updates).eq('id', args.booking_id);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ booking: { ...booking, ...updates } });
    }
    case 'get_pending_requests': {
      const { data } = await ctx.sb.from('guest_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(20);
      return JSON.stringify({ requests: data || [] });
    }
    case 'get_today_stats': {
      return JSON.stringify(ctx.context);
    }
    default: return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
