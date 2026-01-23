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
const generateDispatchEmailHTML = (orderDetails, productImages, relatedBackorders, accountUrl = 'https://www.rapidsupplies.com.au/_myacct') => {
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
  const purchaseOrderNumber = order.PurchaseOrderNumber || '';

  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.toLocaleString('en-US', { month: 'long' });
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Format shipping address for single line
  const formatAddressSingleLine = (address) => {
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

  const shipToName = shipAddress?.Name || customerName;

  // Helper function to extract sequence number from OrderLineID (format: "26-0011994-1")
  const getOrderLineSequence = (orderLineId) => {
    if (!orderLineId || typeof orderLineId !== 'string') return 0;
    const parts = orderLineId.split('-');
    const lastPart = parts[parts.length - 1];
    return parseInt(lastPart) || 0;
  };

  // Get order lines and sort by OrderLineID sequence
  const orderLines = (order.OrderLine || []).sort((a, b) => {
    const aSeq = getOrderLineSequence(a.OrderLineID);
    const bSeq = getOrderLineSequence(b.OrderLineID);
    return aSeq - bSeq;
  });

  // Create a map of SKU to product image for quick lookup
  const imageMap = {};
  if (productImages?.Item) {
    productImages.Item.forEach(item => {
      if (item.SKU && item.preferredImage?.URL) {
        imageMap[item.SKU] = item.preferredImage.URL;
      }
    });
  }

  // Generate table rows for dispatched items (Letter Section)
  let letterTableRows = '';
  if (orderLines.length === 0) {
    letterTableRows = `
      <tr>
        <td colspan="5" style="padding: 20px; text-align: center; color: #666;">
          No items found in this order.
        </td>
      </tr>
    `;
  } else {
    orderLines.forEach(line => {
      const sku = line.SKU || '';
      const productName = escapeHtml(line.ProductName || '');
      const quantity = line.Quantity || line.Qty || 0;
      const shippingMethod = escapeHtml(line.ShippingMethod || 'Local Delivery'); // Default to Local Delivery if missing, as per example logic or N/A
      const imageUrl = imageMap[sku] || '';

      // Format description: ProductName (SKU)
      const description = sku
        ? `${productName} (${escapeHtml(sku)})`
        : productName;

      // Image cell
      const imageCell = imageUrl
        ? `<img height="50px" width="50px" alt="${escapeHtml(description)}" border="0" src="${escapeHtml(imageUrl)}" style="display:block;" />`
        : '<span style="color: #999; font-size: 10px;">No image</span>';

      letterTableRows += `
        <tr>
          <td valign="top">${imageCell}</td>
          <td valign="top">${quantity}</td>
          <td valign="top">${description}<i></i> </td>
          <td valign="top">${shippingMethod}</td>
          <td valign="top" colspan="2"></td>
        </tr>
        <tr><td colspan="5"></td></tr>
      `;
    });
  }

  // Generate table rows for dispatched items (Tracking Section)
  // Re-using similar logic but slightly different markup as per example
  let trackingTableRows = '';
  if (orderLines.length > 0) {
    orderLines.forEach(line => {
      const sku = line.SKU || '';
      const productName = escapeHtml(line.ProductName || '');
      const quantity = line.Quantity || line.Qty || 0;
      const shippingMethod = escapeHtml(line.ShippingMethod || 'Local Delivery');
      const imageUrl = imageMap[sku] || '';

      const description = sku
        ? `${productName} (${escapeHtml(sku)})`
        : productName;

      const imageCell = imageUrl
        ? `<img style="max-width:100px; margin:0 auto" alt="${escapeHtml(description)}" class="x_img-small-thumb" src="${escapeHtml(imageUrl)}" />`
        : '<span style="color: #999;">No image</span>';

      trackingTableRows += `
            <tr>
                <td>${imageCell}</td>
                <td>${quantity}</td>
                <td>${description}<br></td>
                <td><p><strong>${shippingMethod}</strong></p></td>
            </tr>
        `;
    });
  }

  // Generate Backorder Rows
  let backorderSection = '';
  if (relatedBackorders && relatedBackorders.Order && relatedBackorders.Order.length > 0) {
    let backorderRows = '';
    relatedBackorders.Order.forEach(boOrder => {
      if (boOrder.OrderLine) {
        // Sort backorder lines by OrderLineID sequence
        boOrder.OrderLine.sort((a, b) => {
          const aSeq = getOrderLineSequence(a.OrderLineID);
          const bSeq = getOrderLineSequence(b.OrderLineID);
          return aSeq - bSeq;
        });
        boOrder.OrderLine.forEach(line => {
          const qty = line.Quantity || line.Qty || 0;
          const sku = line.SKU || '';
          const code = escapeHtml(sku);
          const name = escapeHtml(line.ProductName || '');
          const unitPrice = line.UnitPrice ? `$${Number(line.UnitPrice).toFixed(2)}` : '';
          const subtotalRaw = (line.Quantity || 0) * (line.UnitPrice || 0);
          const subtotal = subtotalRaw ? `$${subtotalRaw.toFixed(2)}` : '';
          const boImageUrl = imageMap[sku] || '';
          const boImageCell = boImageUrl
            ? `<img src="${escapeHtml(boImageUrl)}" alt="${escapeHtml(name)}" style="width:50px;height:50px;object-fit:contain;border-radius:4px;" />`
            : '<span style="color:#999;font-size:10px;">No image</span>';

          backorderRows += `
                <tr>
                    <td style="padding:12px 8px;text-align:center;vertical-align:middle;">${boImageCell}</td>
                    <td style="padding:12px 8px;text-align:center;vertical-align:middle;">${qty}</td>
                    <td style="padding:12px 8px;vertical-align:middle;"><span style="color:#333;">${code}</span></td>
                    <td style="padding:12px 8px;vertical-align:middle;">${name}</td>
                    <td style="padding:12px 8px;text-align:right;vertical-align:middle;">${unitPrice}</td>
                    <td style="padding:12px 8px;text-align:right;vertical-align:middle;font-weight:600;">${subtotal}</td>
                </tr>
               `;
        });
      }
    });

    if (backorderRows) {
      backorderSection = `
        <div style="margin-top:30px;border:1px solid #80BB3D;border-radius:8px;overflow:hidden;">
            <div style="background:#222222;padding:15px 20px;">
              <h3 style="margin:0;color:#fff;font-size:18px;font-weight:600;">⏳ Items on Backorder</h3>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8f8f8;">
                      <th style="padding:12px 8px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">Image</th>
                      <th style="padding:12px 8px;text-align:center;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">QTY</th>
                      <th style="padding:12px 8px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">Code</th>
                      <th style="padding:12px 8px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">Name</th>
                      <th style="padding:12px 8px;text-align:right;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">Unit Price</th>
                      <th style="padding:12px 8px;text-align:right;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${backorderRows}
                </tbody>
            </table>
        </div>
        `;
    }
  }


  // Split Order ID for display
  const orderIdParts = orderId.split('-');
  const orderIdPrefix = orderIdParts[0] || '';
  const orderIdSuffix = orderIdParts.slice(1).join('-') || '';

  // Generate the HTML email
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Dispatched - RapidClean Illawarra</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background-color:#f4f7fa;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);overflow:hidden;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background:#222222;padding:30px 40px;text-align:center;">
              <img src="https://www.rapidsupplies.com.au/assets/images/company_logo_white.png" alt="RapidClean Illawarra" style="max-width:200px;height:auto;margin-bottom:20px;display:block;margin-left:auto;margin-right:auto;" />
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:600;">📦 Order Dispatched</h1>
              <p style="margin:12px 0 0;color:#80BB3D;font-size:22px;font-weight:700;letter-spacing:0.5px;">Order #${escapeHtml(orderId)}</p>
            </td>
          </tr>
          
          <!-- Greeting Section -->
          <tr>
            <td style="padding:30px 40px 20px;">
              <p style="margin:0 0 15px;font-size:16px;line-height:1.6;color:#333;">
                Dear <strong>${escapeHtml(customerName)}</strong>,
              </p>
              <p style="margin:0 0 15px;font-size:15px;line-height:1.6;color:#555;">
                Thank you for shopping with <strong>RapidClean Illawarra</strong>.
              </p>
              <p style="margin:0 0 15px;font-size:15px;line-height:1.6;color:#555;">
                Below is a list of items that have been dispatched to your nominated shipping address. A tax invoice has also been attached to this email for your records.
              </p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#555;">
                To track the progress of this and other orders online please go to 
                <a href="${escapeHtml(accountUrl)}" style="color:#1a5f7a;text-decoration:underline;font-weight:500;">your account</a> 
                and select the order you want to track.
              </p>
            </td>
          </tr>
          
          <!-- Dispatched Items Section -->
          <tr>
            <td style="padding:0 40px 30px;">
              <div style="border:1px solid #e0e6ed;border-radius:8px;overflow:hidden;">
                <div style="background:#80BB3D;padding:15px 20px;">
                  <h2 style="margin:0;color:#fff;font-size:18px;font-weight:600;">✓ Items That Have Been Dispatched</h2>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f8faf9;">
                      <th style="padding:14px 12px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;font-size:13px;">Image</th>
                      <th style="padding:14px 12px;text-align:center;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;font-size:13px;width:50px;">Qty</th>
                      <th style="padding:14px 12px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;font-size:13px;">Description</th>
                      <th style="padding:14px 12px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;font-size:13px;">Ship Method</th>
                      <th style="padding:14px 12px;text-align:left;font-weight:600;color:#222222;border-bottom:2px solid #80BB3D;font-size:13px;">Consignment #</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderLines.length === 0 ? `
                    <tr>
                      <td colspan="5" style="padding:30px;text-align:center;color:#888;">No items found in this order.</td>
                    </tr>
                    ` : orderLines.map((line, index) => {
    const sku = line.SKU || '';
    const productName = escapeHtml(line.ProductName || '');
    const quantity = line.Quantity || line.Qty || 0;
    const shippingMethod = escapeHtml(line.ShippingMethod || 'Local Delivery');
    const imgUrl = imageMap[sku] || '';
    const desc = sku ? `${productName} (${escapeHtml(sku)})` : productName;
    const imgCell = imgUrl
      ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(desc)}" style="width:60px;height:60px;object-fit:contain;border-radius:6px;border:1px solid #eee;" />`
      : '<span style="color:#999;font-size:11px;">No image</span>';
    const bgColor = index % 2 === 0 ? '#fff' : '#f9fbfa';
    return `
                    <tr style="background:${bgColor};">
                      <td style="padding:12px;vertical-align:middle;">${imgCell}</td>
                      <td style="padding:12px;text-align:center;vertical-align:middle;font-weight:600;color:#333;">${quantity}</td>
                      <td style="padding:12px;vertical-align:middle;font-size:14px;color:#444;">${desc}</td>
                      <td style="padding:12px;vertical-align:middle;font-size:13px;color:#666;">${shippingMethod}</td>
                      <td style="padding:12px;vertical-align:middle;font-size:13px;color:#666;"></td>
                    </tr>`;
  }).join('')}
                  </tbody>
                </table>
              </div>
              <p style="margin:20px 0 0;font-size:13px;color:#777;line-height:1.5;">
                <strong>Please note:</strong> Some items on your order may arrive separately if they are sent using different shipping methods.
              </p>
            </td>
          </tr>
          
          <!-- Order Details Section -->
          <tr>
            <td style="padding:0 40px 30px;">
              <div style="border:1px solid #e0e6ed;border-radius:8px;overflow:hidden;">
                <div style="background:#222222;padding:15px 20px;">
                  <h2 style="margin:0;color:#fff;font-size:18px;font-weight:600;">📋 Shipping Tracking For Order #${escapeHtml(orderId)}</h2>
                </div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:25px;vertical-align:top;width:50%;border-right:1px solid #eee;">
                      <h3 style="margin:0 0 15px;font-size:15px;color:#80BB3D;font-weight:600;">Order Status</h3>
                      <table cellpadding="0" cellspacing="0" style="font-size:14px;">
                        ${purchaseOrderNumber ? `
                        <tr>
                          <td style="padding:5px 0;color:#666;width:120px;">PO #:</td>
                          <td style="padding:5px 0;color:#333;font-weight:500;">${escapeHtml(purchaseOrderNumber)}</td>
                        </tr>` : ''}
                        <tr>
                          <td style="padding:5px 0;color:#666;width:120px;">Status:</td>
                          <td style="padding:5px 0;"><span style="background:#80BB3D;color:#fff;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;">${escapeHtml(orderStatus)}</span></td>
                        </tr>
                        <tr>
                          <td style="padding:5px 0;color:#666;">Date Placed:</td>
                          <td style="padding:5px 0;color:#333;">${escapeHtml(formatDate(datePlaced))}</td>
                        </tr>
                        <tr>
                          <td style="padding:5px 0;color:#666;">Date Invoiced:</td>
                          <td style="padding:5px 0;color:#333;">${escapeHtml(formatDate(dateInvoiced))}</td>
                        </tr>
                      </table>
                    </td>
                    <td style="padding:25px;vertical-align:top;width:50%;">
                      <h3 style="margin:0 0 15px;font-size:15px;color:#80BB3D;font-weight:600;">Ship To</h3>
                      <div style="font-size:14px;line-height:1.6;color:#444;">
                        ${order.ShipCompany ? `<strong>${escapeHtml(order.ShipCompany)}</strong><br>` : ''}
                        ${escapeHtml(order.ShipFirstName || '')} ${escapeHtml(order.ShipLastName || '')}<br>
                        ${escapeHtml([order.ShipStreetLine1, order.ShipStreetLine2].filter(Boolean).join(', '))}<br>
                        ${escapeHtml([order.ShipCity, order.ShipState, order.ShipPostCode].filter(Boolean).join(' '))}<br>
                        ${escapeHtml(order.ShipCountry || 'Australia')}
                      </div>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          
          <!-- Tracking Items Table -->
          <tr>
            <td style="padding:0 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e0e6ed;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#f5f7fa;">
                    <th style="padding:14px 12px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e6ed;font-size:13px;">Image</th>
                    <th style="padding:14px 12px;text-align:center;font-weight:600;color:#555;border-bottom:1px solid #e0e6ed;font-size:13px;">Qty</th>
                    <th style="padding:14px 12px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e6ed;font-size:13px;">Description</th>
                    <th style="padding:14px 12px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #e0e6ed;font-size:13px;">Shipping Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderLines.map((line, index) => {
    const sku = line.SKU || '';
    const productName = escapeHtml(line.ProductName || '');
    const quantity = line.Quantity || line.Qty || 0;
    const shippingMethod = escapeHtml(line.ShippingMethod || 'Local Delivery');
    const imgUrl = imageMap[sku] || '';
    const desc = sku ? `${productName} (${escapeHtml(sku)})` : productName;
    const imgCell = imgUrl
      ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(desc)}" style="width:70px;height:70px;object-fit:contain;border-radius:6px;" />`
      : '<span style="color:#999;">No image</span>';
    const bgColor = index % 2 === 0 ? '#fff' : '#fafbfc';
    return `
                  <tr style="background:${bgColor};">
                    <td style="padding:15px 12px;vertical-align:middle;">${imgCell}</td>
                    <td style="padding:15px 12px;text-align:center;vertical-align:middle;font-weight:600;font-size:16px;color:#333;">${quantity}</td>
                    <td style="padding:15px 12px;vertical-align:middle;font-size:14px;color:#444;">${desc}</td>
                    <td style="padding:15px 12px;vertical-align:middle;"><span style="background:#f0f8e8;color:#80BB3D;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;">${shippingMethod}</span></td>
                  </tr>`;
  }).join('')}
                </tbody>
              </table>
            </td>
          </tr>
          
          <!-- Backorder Section -->
          ${backorderSection ? `
          <tr>
            <td style="padding:0 40px 30px;">
              ${backorderSection}
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="background:#f5f7fa;padding:25px 40px;border-top:1px solid #e0e6ed;">
              <p style="margin:0;font-size:13px;color:#777;text-align:center;">
                Thank you for choosing <strong style="color:#80BB3D;">RapidClean Illawarra</strong>
              </p>
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
            "OrderLine.OrderLineID",
            "OrderLine.SKU",
            "OrderLine.Quantity",
            "OrderLine.Qty",
            "OrderLine.ShippingMethod",
            "OrderLine.ProductName",
            "DatePlaced",
            "OrderStatus",
            "DatePlaced",
            "DateInvoiced",
            "PurchaseOrderNumber",
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
            "OrderLine.OrderLineID",
            "OrderLine.ProductName",
            "OrderLine.UnitPrice",
            "OrderLine.Quantity",
            "OrderLine.Qty",
            "OrderLine.SKU"
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

    // Check if OrderStatus is "Dispatch" or "Dispatched" - only process dispatch notifications (unless testing)
    if (!['Dispatch', 'Dispatched'].includes(payload.OrderStatus) && !payload.joeven_test) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Order notification received but not processed',
          reason: `Order status is "${payload.OrderStatus}", only "Dispatch" and "Dispatched" orders are processed`,
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
    if (orderDetails && (['Dispatch', 'Dispatched'].includes(payload.OrderStatus) || payload.joeven_test)) {
      try {
        htmlEmail = generateDispatchEmailHTML(orderDetails, productImages, relatedBackorders);
        console.log('HTML email template generated successfully');
      } catch (htmlError) {
        console.error('Failed to generate HTML email template:', {
          error: htmlError.message,
          stack: htmlError.stack
        });
        // Continue processing even if HTML generation fails
      }
    }

    // Check if Display field is set to "email" to return HTML, otherwise return JSON
    const returnHtml = payload.Display === 'email';

    if (returnHtml) {
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
    }

    // Return JSON response with order details
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Order notification processed successfully',
        order_id: payload.OrderID,
        order_status: payload.OrderStatus,
        event_id: payload.EventID,
        display_mode: payload.Display || 'json',
        processed: true,
        html_generated: htmlEmail !== null,
        order_details_fetched: orderDetails !== null,
        order_details: orderDetails,
        related_backorders_fetched: relatedBackorders !== null,
        related_backorders: relatedBackorders,
        product_images_fetched: productImages !== null,
        product_images: productImages,
        timestamp: payload.CurrentTime
      }),
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