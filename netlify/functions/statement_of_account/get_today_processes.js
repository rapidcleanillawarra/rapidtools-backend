const { supabase } = require('../utils/supabaseInit');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    // Get today's date range in Australia/Sydney time
    // We can use the created_at column which is timestamptz
    // A simple way is to use .gte and .lte with ISO strings for start/end of day
    // Or simpler: use .filter with rpc or raw query if needed, 
    // but standard supabase filter is:
    // .gte('created_at', todayStart)
    
    const now = new Date();
    // Adjust to Sydney time (AEST/AEDT)
    const sydneyTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    
    const startOfDay = `${sydneyTime}T00:00:00Z`; // UTC for comparison if stored as timestamptz
    // Actually, Supabase handles timezone strings if we provide them
    const sydneyStartOfDay = `${sydneyTime}T00:00:00+11:00`; // Sydney is typically +10 or +11
    
    // Better approach: use relative time if possible or just the date part
    // Since created_at is timestamptz, we can query for records >= today's date
    const today = new Date();
    today.setHours(0,0,0,0);
    const isoToday = today.toISOString();

    const { data, error } = await supabase
      .from('statement_of_accounts')
      .select('*')
      .gte('created_at', isoToday)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Convert created_at to Australia/Sydney timezone for each row
    const rowsWithSydneyTime = data.map(row => {
      if (row.created_at) {
        try {
          const date = new Date(row.created_at);
          const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Australia/Sydney',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          const parts = formatter.formatToParts(date);
          const getPart = (type) => parts.find(p => p.type === type).value;
          
          // Return a clean YYYY-MM-DD HH:mm format
          row.created_at = `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}`;
        } catch (e) {
          console.error('Error converting date:', e);
        }
      }
      return row;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: rowsWithSydneyTime.length,
        rows: rowsWithSydneyTime
      })
    };
  } catch (error) {
    console.error('Error fetching today processes:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
