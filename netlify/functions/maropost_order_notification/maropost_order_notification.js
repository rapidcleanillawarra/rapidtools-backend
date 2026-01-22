const handler = async (event) => {
  // Add CORS headers for production
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        message: 'Method Not Allowed',
        debug: {
          expected: 'POST',
          received: event.httpMethod,
          suggestion: 'Ensure the request uses the POST method.',
        },
      }),
    };
  }

  try {
    // Validate request body exists
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Request body is required',
          debug: {
            suggestion: 'Ensure the request includes a valid JSON body.',
          },
        }),
      };
    }

    // Parse the payload
    let payload = JSON.parse(event.body);

    // Check for test payload - for local testing only
    if (payload.joeven_test === true) {
      console.log('Test payload detected, using sample dispatch data');
      payload = {
        "CurrentTime": "2026-01-22 04:16:01",
        "EventID": "15846",
        "EventType": "Order",
        "OrderID": "26-0011970",
        "OrderStatus": "Dispatched"
      };
    }

    // Validate required fields
    const requiredFields = ['CurrentTime', 'EventID', 'EventType', 'OrderID', 'OrderStatus'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing required fields in payload',
          debug: {
            missing_fields: missingFields,
            suggestion: 'Ensure all required fields are present in the payload.',
          },
        }),
      };
    }

    // Check if OrderStatus is "Dispatch" - only process when dispatching
    if (payload.OrderStatus !== 'Dispatch') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Order notification received but not processed',
          reason: `Order status is "${payload.OrderStatus}", only "Dispatch" orders are processed`,
          order_id: payload.OrderID,
          order_status: payload.OrderStatus,
          processed: false
        }),
      };
    }

    // Process the dispatch notification
    console.log('Processing dispatch notification:', {
      order_id: payload.OrderID,
      event_id: payload.EventID,
      timestamp: payload.CurrentTime
    });

    // TODO: Add your dispatch processing logic here
    // This could include:
    // - Updating order status in database
    // - Sending notifications to relevant parties
    // - Triggering fulfillment processes
    // - Logging dispatch events

    const timestamp_utc = new Date().toISOString();

    // For now, just log and return success
    const responseData = {
      message: 'Dispatch order notification processed successfully',
      order_id: payload.OrderID,
      order_status: payload.OrderStatus,
      event_id: payload.EventID,
      current_time: payload.CurrentTime,
      processed_at: timestamp_utc,
      processed: true
    };

    // Optional: Save to Firestore for tracking
    try {
      const { db } = require('../utils/firebaseInit');

      const firestoreDoc = {
        order_id: payload.OrderID,
        order_status: payload.OrderStatus,
        event_id: payload.EventID,
        event_type: payload.EventType,
        current_time: payload.CurrentTime,
        processed_at: timestamp_utc,
        notification_type: 'maropost_order_dispatch'
      };

      await db.collection('maropost_order_notifications').add(firestoreDoc);

      console.log('Dispatch notification saved to Firestore:', { order_id: payload.OrderID });
    } catch (firestoreError) {
      console.error('Failed to save dispatch notification to Firestore:', {
        error: firestoreError.message,
        order_id: payload.OrderID,
        stack: firestoreError.stack
      });
      // Don't throw the error - continue with the response
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData),
    };

  } catch (error) {
    console.error('Error processing maropost order notification:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Internal Server Error',
        error: error.message,
        debug: {
          stack: error.stack,
          suggestion: 'Check the server logs for detailed error traces.',
        },
      }),
    };
  }
};

module.exports = { handler };