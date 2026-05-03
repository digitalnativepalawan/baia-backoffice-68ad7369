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

// Build system prompt with guest context
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

// Tool definitions for StepFun
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_menu_items',
      description: 'Search menu items by category or keyword. Shows name, price, description, allergens if available.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Menu category (e.g., "Salads", "Main Course")' },
          query: { type: 'string', description: 'Keyword to search in name/description' },
          limit: { type: 'number', default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_order_status',
      description: 'Get recent orders for this guest (last 3). Returns order ID, status, items, total.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_tour_booking',
      description: 'Book a tour. Requires tour_name, date (YYYY-MM-DD), pax (number of people).',
      parameters: {
        type: 'object',
        properties: {
          tour_name: { type: 'string' },
          date: { type: 'string', format: 'date' },
          pax: { type: 'number' },
          notes: { type: 'string' }
        },
        required: ['tour_name', 'date', 'pax']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_guest_request',
      description: 'Create a service request: housekeeping, maintenance, frontdesk, or other.',
      parameters: {
        type: 'object',
        properties: {
          request_type: { type: 'string', enum: ['housekeeping', 'maintenance', 'frontdesk', 'other'] },
          details: { type: 'string' }
        },
        required: ['request_type', 'details']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_resort_info',
      description: 'Get resort policies: WiFi, checkout time, contact phone, address.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [], guestSession } = await req.json();

    // Validate guest session
    if (!guestSession?.booking_id || !guestSession?.room_id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const sb = getSupabaseAdmin();

    // Fetch context in parallel
    const [guestRes, ordersRes, profileRes, categoriesRes] = await Promise.all([
      sb.from('resort_ops_guests').select('full_name').eq('booking_id', guestSession.booking_id).single(),
      sb.from('orders')
        .select('id, total, status, created_at')
        .eq('room_id', guestSession.room_id)
        .order('created_at', { ascending: false })
        .limit(3),
      sb.from('resort_profile').select('*').single(),
      sb.from('menu_categories').select('name').eq('active', true)
    ]);

    const guestName = guestRes.data?.full_name || 'Guest';
    const resortProfile = profileRes.data;
    const menuCategories = categoriesRes.data?.map((c: any) => c.name) || [];

    // Build messages array
    const systemPrompt = buildSystemPrompt({
      guestName,
      roomName: guestSession.room_name,
      checkOut: guestSession.check_out,
      recentOrders: ordersRes.data || [],
      resortProfile,
      menuCategories
    });

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10),
      { role: 'user', content: message }
    ];

    // Call StepFun
    const response = await fetch(STEPFUN_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STEPFUN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: HERMES_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`StepFun API ${response.status}: ${err}`);
    }

    const result = await response.json();
    let reply = result.choices[0].message.content || '';
    const toolCalls = result.choices[0].message.tool_calls;

    // Handle tool calls
    if (toolCalls && toolCalls.length > 0) {
      messages.push(result.choices[0].message);

      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall.function;
        let toolResult: string;

        try {
          toolResult = await executeTool(name, args, {
            sb,
            guestSession,
            orders: ordersRes.data || [],
            resortProfile
          });
        } catch (err: any) {
          toolResult = JSON.stringify({ error: err.message });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult
        });
      }

      // Second LLM call to get final answer
      const followup = await fetch(STEPFUN_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STEPFUN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: HERMES_MODEL,
          messages
        })
      });

      if (!followup.ok) {
        throw new Error(`StepFun follow-up error: ${followup.status}`);
      }

      const followupJson = await followup.json();
      reply = followupJson.choices[0].message.content || '';
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error: any) {
    console.error('Hermes chat error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Tool execution
async function executeTool(
  name: string,
  argsString: string,
  ctx: {
    sb: any;
    guestSession: any;
    orders: any[];
    resortProfile: any;
  }
): Promise<string> {
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
      return JSON.stringify(ctx.orders);
    }

    case 'create_tour_booking': {
      const { tour_name, date, pax, notes } = args;

      // Verify tour exists
      const { data: tourConfig } = await ctx.sb
        .from('tours_config')
        .select('id, tour_name')
        .ilike('tour_name', `%${tour_name}%`)
        .limit(1);

      if (!tourConfig || tourConfig.length === 0) {
        return JSON.stringify({
          error: `Tour "${tour_name}" not found. Please check available tours.`
        });
      }

      const { data, error } = await ctx.sb.from('tour_bookings').insert({
        booking_id: ctx.guestSession.booking_id,
        guest_name: ctx.guestSession.guest_name || 'Guest',
        room_id: ctx.guestSession.room_id,
        tour_name,
        date,
        pax,
        notes: notes || '',
        status: 'pending'
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
        request_type,
        details,
        status: 'new'
      }).select();

      if (error) throw error;

      return JSON.stringify({ success: true, request: data[0] });
    }

    case 'get_resort_info': {
      // Use real resort profile data if available, fallback to defaults
      const profile = ctx.resortProfile;
      return JSON.stringify({
        wifi_ssid: profile?.wifi_ssid || 'BAIA-Guest',
        wifi_password: profile?.wifi_password || 'welcome',
        checkout_time: profile?.checkout_time || '11:00 AM',
        front_desk_phone: profile?.contact_phone || 'Contact front desk',
        address: profile?.address || 'San Vicente, Palawan'
      });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
