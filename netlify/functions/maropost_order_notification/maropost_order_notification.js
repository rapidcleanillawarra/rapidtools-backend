// Helper function to escape HTML to prevent XSS
const escapeHtml = (text) => {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
};

// Generate HTML email template for dispatched orders
const generateDispatchEmailHTML = (orderDetails, productImages, accountUrl = 'https://rapidclean.com/account') => {
  // Extract order data
  const order = orderDetails?.Order?.[0];
  if (!order) {
    return '<p>Order details not available.</p>';
  }

  // Get customer name (fallback to Username if name not available)
  const firstName = order.BillFirstName || '';
  const lastName = order.BillLastName || '';
  const customerName = (firstName || lastName) 
    ? `${firstName} ${lastName}`.trim() 
    : (order.Username || 'Customer');

  // Get order details
  const orderId = order.ID || '';
  const orderStatus = order.OrderStatus || 'Dispatched';
  const datePlaced = order.DatePlaced || '';
  const dateInvoiced = order.DateInvoiced || '';
  const shipAddress = order.ShipAddress || {};
  
  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Format shipping address
  const formatAddress = (address) => {
    if (!address || typeof address !== 'object') return '';
    const parts = [];
    if (address.Address1) parts.push(address.Address1);
    if (address.Address2) parts.push(address.Address2);
    if (address.City) parts.push(address.City);
    if (address.State) parts.push(address.State);
    if (address.Postcode) parts.push(address.Postcode);
    if (address.Country) parts.push(address.Country);
    return parts.join(', ');
  };

  const shipToAddress = formatAddress(shipAddress);
  const shipToName = shipAddress?.Name || customerName;

  // Get order lines
  const orderLines = order.OrderLine || [];

  // Create a map of SKU to product image for quick lookup
  const imageMap = {};
  if (productImages?.Item) {
    productImages.Item.forEach(item => {
      if (item.SKU && item.preferredImage?.URL) {
        imageMap[item.SKU] = item.preferredImage.URL;
      }
    });
  }

  // Generate table rows for dispatched items
  let tableRows = '';
  if (orderLines.length === 0) {
    tableRows = `
      <tr>
        <td colspan="4" style="padding: 20px; text-align: center; color: #666;">
          No items found in this order.
        </td>
      </tr>
    `;
  } else {
    orderLines.forEach(line => {
      const sku = line.SKU || '';
      const productName = escapeHtml(line.ProductName || '');
      const quantity = line.Quantity || line.Qty || 0;
      const shippingMethod = escapeHtml(line.ShippingMethod || 'N/A');
      const imageUrl = imageMap[sku] || '';
      
      // Format description: ProductName (SKU)
      const description = sku 
        ? `${productName} (${escapeHtml(sku)})`
        : productName;

      // Image cell - use placeholder if no image
      const imageCell = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(productName)}" style="max-width: 80px; max-height: 80px; display: block;" />`
        : '<span style="color: #999; font-size: 12px;">No image</span>';

      tableRows += `
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center; vertical-align: middle;">
            ${imageCell}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center; vertical-align: middle;">
            ${quantity}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; vertical-align: middle;">
            ${description}
          </td>
          <td style="padding: 10px; border: 1px solid #ddd; vertical-align: middle;">
            ${shippingMethod}
          </td>
        </tr>
      `;
    });
  }

  // Generate the HTML email
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Dispatched - RapidClean Illawarra</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #ffffff; color: #000000;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
          <!-- Salutation -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #000000;">
                Dear ${escapeHtml(customerName)},
              </p>
            </td>
          </tr>
          
          <!-- Thank you message -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #000000;">
                Thank you for shopping with RapidClean Illawarra.
              </p>
            </td>
          </tr>
          
          <!-- Introductory paragraph -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #000000;">
                Below is a list of items that have been <strong>dispatched</strong> to your nominated shipping address. A tax invoice has also been attached to this email for your records.
              </p>
            </td>
          </tr>
          
          <!-- Tracking information -->
          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #000000;">
                To track the progress of this and other orders online please go to <a href="${escapeHtml(accountUrl)}" style="color: #800080; text-decoration: underline;">your account</a> and select the order you want to track.
              </p>
            </td>
          </tr>
          
          <!-- Dispatched items heading -->
          <tr>
            <td style="padding-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #000000;">
                Items That Have Been <strong>Dispatched</strong>
              </h2>
            </td>
          </tr>
          
          <!-- Items table -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #ddd;">
                <!-- Table header -->
                <thead>
                  <tr style="background-color: #f5f5f5;">
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: bold; color: #000000;">
                      Image
                    </th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #000000;">
                      Qty
                    </th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: bold; color: #000000;">
                      Description
                    </th>
                    <th style="padding: 12px; border: 1px solid #ddd; text-align: left; font-weight: bold; color: #000000;">
                      Ship Method Consignment #
                    </th>
                  </tr>
                </thead>
                <!-- Table body -->
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </td>
          </tr>
          
          <!-- Please note message -->
          <tr>
            <td style="padding-top: 30px; padding-bottom: 20px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #000000;">
                <strong>Please note:</strong> some items on your order may arrive separately if they are sent using different shipping methods.
              </p>
            </td>
          </tr>
          
          <!-- Horizontal separator -->
          <tr>
            <td style="padding-bottom: 20px; border-bottom: 1px solid #ddd;"></td>
          </tr>
          
          <!-- Shipping Tracking Section -->
          <tr>
            <td style="padding-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #000000; padding-bottom: 15px;">
                Shipping Tracking For Order <span style="color: #008000;">#${escapeHtml(orderId.split('-')[0] || '')}</span><span style="background-color: #ffff00;">${escapeHtml(orderId.split('-').slice(1).join('-') || '')}</span>
              </h2>
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 5px 0;">
                    <strong>Status:</strong> <span style="color: #0000ff;">${escapeHtml(orderStatus)}</span>
                  </td>
                </tr>
                ${datePlaced ? `
                <tr>
                  <td style="padding: 5px 0;">
                    <strong>Date Placed:</strong> ${escapeHtml(formatDate(datePlaced))}
                  </td>
                </tr>
                ` : ''}
                ${dateInvoiced ? `
                <tr>
                  <td style="padding: 5px 0;">
                    <strong>Date Invoiced:</strong> ${escapeHtml(formatDate(dateInvoiced))}
                  </td>
                </tr>
                ` : ''}
              </table>
              
              ${shipToAddress ? `
              <div style="margin-bottom: 20px;">
                <strong>Ship to</strong><br>
                ${shipToName ? `<div style="padding: 5px 0;">${escapeHtml(shipToName)}</div>` : ''}
                <div style="padding: 5px 0; line-height: 1.6;">
                  ${escapeHtml(shipToAddress)}
                </div>
              </div>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return html;
};

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
    const isTestMode = payload.joeven_test === true;
    if (isTestMode) {
      console.log('Test payload detected, using sample dispatch data');
      payload = {
        CurrentTime: "2026-01-22 04:16:01",
        EventID: 15846,
        EventType: "Order",
        OrderID: payload.order_id || "26-0011994", // Allow custom order ID
        OrderStatus: payload.order_status || "Dispatch", // Allow custom order status (default to "Dispatch" for test mode)
        joeven_test: true // Preserve test flag
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
            "BillFirstName",
            "BillLastName",
            "BillAddress",
            "ShipAddress",
            "OrderLine",
            "OrderLine.SKU",
            "OrderLine.Quantity",
            "OrderLine.Qty",
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

    // Check if OrderStatus is "Dispatch" - only process dispatch notifications (unless testing)
    if (payload.OrderStatus !== 'Dispatch' && !payload.joeven_test) {
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

    // Generate HTML email template for dispatch notifications (or when testing)
    let htmlEmail = null;
    if (orderDetails && (payload.OrderStatus === 'Dispatch' || payload.joeven_test)) {
      try {
        htmlEmail = generateDispatchEmailHTML(orderDetails, productImages);
        console.log('HTML email template generated successfully');
      } catch (htmlError) {
        console.error('Failed to generate HTML email template:', {
          error: htmlError.message,
          stack: htmlError.stack
        });
        // Continue processing even if HTML generation fails
      }
    }

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

    // Return HTML response if HTML was generated, otherwise return a simple HTML message
    if (htmlEmail) {
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/html'
        },
        body: htmlEmail,
      };
    }

    // For test requests, return HTML even if generation failed
    if (payload.joeven_test) {
      const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Mode - Order Notification</title>
</head>
<body>
  <h1>Test Mode - Order Notification</h1>
  <p><strong>Order ID:</strong> ${escapeHtml(payload.OrderID || 'N/A')}</p>
  <p><strong>Status:</strong> ${escapeHtml(payload.OrderStatus || 'N/A')}</p>
  <p><strong>Event ID:</strong> ${escapeHtml(payload.EventID || 'N/A')}</p>
  <p>HTML email generation ${htmlEmail ? 'succeeded' : 'failed'}. Order details ${orderDetails ? 'were' : 'were not'} fetched successfully.</p>
  ${orderDetails ? `<details><summary>Order Details (JSON)</summary><pre>${JSON.stringify(orderDetails, null, 2)}</pre></details>` : ''}
</body>
</html>
      `.trim();

      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/html'
        },
        body: testHtml,
      };
    }

    // Fallback HTML response if no HTML was generated
    const fallbackHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Order Notification</title>
</head>
<body>
  <h1>Order Notification Processed</h1>
  <p>Order ID: ${escapeHtml(payload.OrderID || 'N/A')}</p>
  <p>Status: ${escapeHtml(payload.OrderStatus || 'N/A')}</p>
  <p>Event ID: ${escapeHtml(payload.EventID || 'N/A')}</p>
  <p>HTML email could not be generated. Order details may not be available or there was an error.</p>
</body>
</html>
    `.trim();

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/html'
      },
      body: fallbackHtml,
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