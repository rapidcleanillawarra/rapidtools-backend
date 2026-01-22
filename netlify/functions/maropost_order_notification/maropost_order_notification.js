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

    // Fetch order details from Power Automate endpoint
    const fetchOrderData = async (orderId) => {
      const orderEndpoint = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

      const orderPayload = {
        "Filter": {
          "OrderID": orderId,
          "OutputSelector": [
            "ID",
            "Username",
            "Email",
            "BillAddress",
            "ShipAddress",
            "OrderLine",
            "OrderLine.ShippingMethod",
            "OrderLine.ProductName",
            "DatePlaced",
            "OrderStatus",
            "DatePlaced",
            "DateInvoiced",
            "DeliveryInstruction"
          ]
        },
        "action": "GetOrder"
      };

      try {
        const response = await fetch(orderEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(orderPayload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const orderData = await response.json();
        console.log('Order data fetched successfully:', { order_id: orderId });
        return orderData;
      } catch (error) {
        console.error('Failed to fetch order data:', {
          order_id: orderId,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    };

    // Process the notification
    console.log('Processing order notification:', {
      order_id: payload.OrderID,
      event_id: payload.EventID,
      timestamp: payload.CurrentTime,
      order_status: payload.OrderStatus
    });

    // Fetch detailed order information for all notifications
    let orderDetails = null;
    try {
      orderDetails = await fetchOrderData(payload.OrderID);
      console.log('Order details retrieved:', {
        order_id: payload.OrderID,
        customer_email: orderDetails?.Order?.[0]?.Email,
        customer_name: `${orderDetails?.Order?.[0]?.BillFirstName} ${orderDetails?.Order?.[0]?.BillLastName}`,
        items_count: orderDetails?.Order?.[0]?.OrderLine?.length || 0
      });
    } catch (fetchError) {
      console.error('Failed to fetch order data:', fetchError.message);
      // Continue processing even if order fetch fails
    }

    // Fetch related backorders using the same endpoint
    const fetchRelatedBackorders = async (orderId, username) => {
      const orderEndpoint = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

      const backorderPayload = {
        "Filter": {
          "Username": username,
          "OrderStatus": ["New Backorder", "Backorder Approved"],
          "RelatedOrderID": [orderId],
          "OutputSelector": [
            "ID",
            "OrderStatus",
            "RelatedOrderID",
            "OrderLine",
            "OrderLine.ProductName",
            "OrderLine.UnitPrice"
          ]
        },
        "action": "GetOrder"
      };

      try {
        const response = await fetch(orderEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(backorderPayload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const backorderData = await response.json();
        console.log('Related backorders fetched successfully:', {
          main_order_id: orderId,
          backorder_count: backorderData?.Order?.length || 0
        });
        return backorderData;
      } catch (error) {
        console.error('Failed to fetch related backorders:', {
          order_id: orderId,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    };

    // Fetch related backorder information
    let relatedBackorders = null;
    try {
      // Get username from the order details we just fetched
      const username = orderDetails?.Order?.[0]?.Username;
      if (username) {
        relatedBackorders = await fetchRelatedBackorders(payload.OrderID, username);

        // Filter backorders to only include those with RelatedOrderID matching the main order ID
        if (relatedBackorders?.Order) {
          const originalCount = relatedBackorders.Order.length;
          relatedBackorders.Order = relatedBackorders.Order.filter(order =>
            order.RelatedOrderID === payload.OrderID
          );
          const filteredCount = relatedBackorders.Order.length;

          console.log('Related backorders filtered:', {
            main_order_id: payload.OrderID,
            original_backorder_count: originalCount,
            filtered_backorder_count: filteredCount,
            backorder_ids: relatedBackorders.Order.map(order => order.ID)
          });
        } else {
          console.log('No backorders found for filtering');
        }
      } else {
        console.log('No username found in order details, skipping backorder fetch');
      }
    } catch (backorderError) {
      console.error('Failed to fetch related backorders:', backorderError.message);
      // Continue processing even if backorder fetch fails
    }

    // Fetch product images using the same endpoint
    const fetchProductImages = async (skus) => {
      const orderEndpoint = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

      const imagePayload = {
        "Filter": {
          "SKU": skus,
          "OutputSelector": [
            "Images"
          ]
        },
        "action": "GetItem"
      };

      try {
        const response = await fetch(orderEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(imagePayload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const imageData = await response.json();
        console.log('Product images fetched successfully:', {
          sku_count: skus.length,
          products_with_images: imageData?.Item?.length || 0
        });
        return imageData;
      } catch (error) {
        console.error('Failed to fetch product images:', {
          skus: skus,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    };

    // Helper function to get preferred image from product images
    const getPreferredImage = (images) => {
      if (!images || !Array.isArray(images)) return null;

      // First try to find "Main" image
      const mainImage = images.find(img => img.Name === 'Main');
      if (mainImage) return mainImage;

      // If no "Main" image, return the first available image
      return images[0] || null;
    };

    // Fetch product images for order items (main order + backorders)
    let productImages = null;
    try {
      // Extract unique SKUs from main order lines
      const mainOrderLines = orderDetails?.Order?.[0]?.OrderLine || [];
      let allSkus = [...new Set(mainOrderLines.map(line => line.SKU).filter(sku => sku))];

      // Extract unique SKUs from related backorders
      if (relatedBackorders?.Order) {
        const backorderLines = relatedBackorders.Order.flatMap(order => order.OrderLine || []);
        const backorderSkus = backorderLines.map(line => line.SKU).filter(sku => sku);
        allSkus = [...new Set([...allSkus, ...backorderSkus])];
      }

      if (allSkus.length > 0) {
        productImages = await fetchProductImages(allSkus);

        // Process images to include preferred image for each product
        if (productImages?.Item) {
          productImages.Item = productImages.Item.map(product => ({
            ...product,
            preferredImage: getPreferredImage(product.Images)
          }));
        }

        console.log('Product images processed:', {
          skus_requested: allSkus.length,
          main_order_skus: mainOrderLines.length,
          backorder_skus: allSkus.length - [...new Set(mainOrderLines.map(line => line.SKU).filter(sku => sku))].length,
          products_found: productImages?.Item?.length || 0,
          products_with_preferred_images: productImages?.Item?.filter(p => p.preferredImage)?.length || 0
        });
      } else {
        console.log('No SKUs found in order details or backorders, skipping image fetch');
      }
    } catch (imageError) {
      console.error('Failed to fetch product images:', imageError.message);
      // Continue processing even if image fetch fails
    }

    // Check if OrderStatus is "Dispatch" - only process dispatch notifications
    if (payload.OrderStatus !== 'Dispatch') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Order notification received but not processed',
          reason: `Order status is "${payload.OrderStatus}", only "Dispatch" orders are processed`,
          order_id: payload.OrderID,
          order_status: payload.OrderStatus,
          processed: false,
          order_details_fetched: orderDetails !== null,
          order_details: orderDetails,
          related_backorders_fetched: relatedBackorders !== null,
          related_backorders: relatedBackorders,
          product_images_fetched: productImages !== null,
          product_images: productImages
        }),
      };
    }

    // TODO: Add your dispatch processing logic here
    // This could include:
    // - Updating order status in database
    // - Sending notifications to relevant parties
    // - Triggering fulfillment processes
    // - Logging dispatch events
    // - Using orderDetails for enhanced processing

    const timestamp_utc = new Date().toISOString();

    // Save notification to Firestore for tracking (all statuses)
    try {
      const { db } = require('../utils/firebaseInit');

      const firestoreDoc = {
        order_id: payload.OrderID,
        order_status: payload.OrderStatus,
        event_id: payload.EventID,
        event_type: payload.EventType,
        current_time: payload.CurrentTime,
        processed_at: timestamp_utc,
        notification_type: payload.OrderStatus === 'Dispatch' ? 'maropost_order_dispatch' : 'maropost_order_notification',
        processed: payload.OrderStatus === 'Dispatch',
        order_details_fetched: orderDetails !== null,
        order_details: orderDetails,
        related_backorders_fetched: relatedBackorders !== null,
        related_backorders: relatedBackorders,
        product_images_fetched: productImages !== null,
        product_images: productImages
      };

      await db.collection('maropost_order_notifications').add(firestoreDoc);

      console.log('Order notification saved to Firestore:', { order_id: payload.OrderID, order_status: payload.OrderStatus });
    } catch (firestoreError) {
      console.error('Failed to save order notification to Firestore:', {
        error: firestoreError.message,
        order_id: payload.OrderID,
        stack: firestoreError.stack
      });
      // Don't throw the error - continue with the response
    }

    // Prepare response data with order details
    const responseData = {
      message: 'Dispatch order notification processed successfully',
      order_id: payload.OrderID,
      order_status: payload.OrderStatus,
      event_id: payload.EventID,
      current_time: payload.CurrentTime,
      processed_at: timestamp_utc,
      processed: true,
      order_details_fetched: orderDetails !== null,
      order_details: orderDetails,
      related_backorders_fetched: relatedBackorders !== null,
      related_backorders: relatedBackorders,
      product_images_fetched: productImages !== null,
      product_images: productImages
    };

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