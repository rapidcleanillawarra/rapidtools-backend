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
      const month = date.toLocaleString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day} ${month} ${year}`;
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
        boOrder.OrderLine.forEach(line => {
          const qty = line.Quantity || line.Qty || 0;
          const code = escapeHtml(line.SKU || '');
          const name = escapeHtml(line.ProductName || '');
          const unitPrice = line.UnitPrice ? `$${Number(line.UnitPrice).toFixed(2)}` : '';
          const subtotalRaw = (line.Quantity || 0) * (line.UnitPrice || 0);
          const subtotal = subtotalRaw ? `$${subtotalRaw.toFixed(2)}` : '';

          backorderRows += `
                <tr>
                    <td>${qty}</td>
                    <td>${code}</td>
                    <td>${name}<br><i></i></td>
                    <td>${unitPrice}</td>
                    <td class="x_text-right">${subtotal}</td>
                </tr>
               `;
        });
      }
    });

    if (backorderRows) {
      backorderSection = `
        <div class="x_panel x_panel-default">
            <div class="x_panel-heading"><h3 class="x_panel-title">Items on backorder</h3></div>
            <table class="x_table">
                <tbody>
                    <tr><th>QTY</th><th>Code</th><th>Name</th><th>Unit Price</th><th class="x_text-right">Subtotal</th></tr>
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
<div>
Dear ${escapeHtml(customerName)}, <p>Thank you for shopping with RapidClean Illawarra. </p><p>Below is a list of items that have been dispatched to your nominated shipping address. A tax invoice has also been attached to this email for your records. </p><p>To track the progress of this and other orders online please go to <a data-auth="NotApplicable" rel="noopener noreferrer" target="_blank" href="${escapeHtml(accountUrl)}" data-linkindex="0" title="${escapeHtml(accountUrl)}">your account</a> and select the order you want to track. </p><hr><h2>Items That Have Been Dispatched</h2><table width="700px" cellspacing="0" cellpadding="2" border="0" align="center"><tbody><tr><td valign="top" width="70"><strong>Image</strong></td><td valign="top" width="32"><strong>Qty</strong></td><td valign="top"><strong>Description</strong></td><td nowrap="" valign="top" width="91"><strong>Ship Method</strong></td><td nowrap="" valign="top" colspan="2"><strong>Consignment #</strong></td></tr>
${letterTableRows}
</tbody></table><p><b>Please note:</b> some items on your order may arrive separately if they are sent using different shipping methods. </p><hr>
<style>
<!--
.x_nPrintDoc
  {margin:0;
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:14px;
  line-height:1.42857143;
  color:#333;
  background-color:#fff;
  box-sizing:border-box}
.x_nPrintDoc a
  {background-color:transparent}
.x_nPrintDoc a:active, .x_nPrintDoc a:hover
  {outline:0}
.x_nPrintDoc b, .x_nPrintDoc strong
  {font-weight:700}
.x_nPrintDoc h1
  {font-size:2em;
  margin:.67em 0}
.x_nPrintDoc small
  {font-size:80%}
.x_nPrintDoc img
  {border:0}
.x_nPrintDoc hr
  {box-sizing:content-box;
  height:0}
.x_nPrintDoc button
  {overflow:visible;
  color:inherit;
  font:inherit;
  margin:0;
  text-transform:none}
.x_nPrintDoc button[disabled]
  {}
.x_nPrintDoc table
  {border-collapse:collapse;
  border-spacing:0}
.x_nPrintDoc td, .x_nPrintDoc th
  {padding:0}
.x_nPrintDoc .x_text-center
  {text-align:center!important}
.x_nPrintDoc .x_text-left
  {text-align:left!important}
.x_nPrintDoc .x_text-right
  {text-align:right!important}
.x_nPrintDoc .x_float_right
  {float:right!important}
.x_nPrintDoc .x_float_left
  {float:left!important}
.x_nPrintDoc a, .x_nPrintDoc a:visited
  {text-decoration:underline}
.x_nPrintDoc thead
  {display:table-header-group}
.x_nPrintDoc img, .x_nPrintDoc tr
  {page-break-inside:avoid}
.x_nPrintDoc img
  {max-width:100%!important}
.x_nPrintDoc h2, .x_nPrintDoc h3, .x_nPrintDoc p
  {orphans:3;
  widows:3}
.x_nPrintDoc h2, .x_nPrintDoc h3
  {page-break-after:avoid}
.x_nPrintDoc .x_table
  {border-collapse:collapse!important}
.x_nPrintDoc .x_table td, .x_nPrintDoc .x_table th
  {background-color:#fff!important}
.x_nPrintDoc .x_table-bordered td, .x_nPrintDoc .x_table-bordered th
  {border:1px solid #ddd!important}
.x_nPrintDoc *
  {box-sizing:border-box}
.x_nPrintDoc :after, .x_nPrintDoc :before
  {box-sizing:border-box}
.x_nPrintDoc a
  {color:#337ab7;
  text-decoration:none}
.x_nPrintDoc a:focus, .x_nPrintDoc a:hover
  {color:#23527c;
  text-decoration:underline}
.x_nPrintDoc a:focus
  {}
.x_nPrintDoc img
  {vertical-align:middle}
.x_nPrintDoc .x_img-responsive
  {display:block;
  max-width:100%;
  height:auto}
.x_nPrintDoc hr
  {margin-top:20px;
  margin-bottom:20px;
  border:0;
  border-top:1px solid #eee}
.x_nPrintDoc [role=button]
  {}
.x_nPrintDoc .x_h1, .x_nPrintDoc .x_h2, .x_nPrintDoc .x_h3, .x_nPrintDoc .x_h4, .x_nPrintDoc .x_h5, .x_nPrintDoc .x_h6, .x_nPrintDoc h1, .x_nPrintDoc h2, .x_nPrintDoc h3, .x_nPrintDoc h4, .x_nPrintDoc h5, .x_nPrintDoc h6
  {font-family:inherit;
  font-weight:500;
  line-height:1.5;
  color:inherit}
.x_nPrintDoc .x_h1 .x_small, .x_nPrintDoc .x_h1 small, .x_nPrintDoc .x_h2 .x_small, .x_nPrintDoc .x_h2 small, .x_nPrintDoc .x_h3 .x_small, .x_nPrintDoc .x_h3 small, .x_nPrintDoc .x_h4 .x_small, .x_nPrintDoc .x_h4 small, .x_nPrintDoc .x_h5 .x_small, .x_nPrintDoc .x_h5 small, .x_nPrintDoc .x_h6 .x_small, .x_nPrintDoc .x_h6 small, .x_nPrintDoc h1 .x_small, .x_nPrintDoc h1 small, .x_nPrintDoc h2 .x_small, .x_nPrintDoc h2 small, .x_nPrintDoc h3 .x_small, .x_nPrintDoc h3 small, .x_nPrintDoc h4 .x_small, .x_nPrintDoc h4 small, .x_nPrintDoc h5 .x_small, .x_nPrintDoc h5 small, .x_nPrintDoc h6 .x_small, .x_nPrintDoc h6 small
  {font-weight:400;
  line-height:1;
  color:#777}
.x_nPrintDoc .x_h1, .x_nPrintDoc .x_h2, .x_nPrintDoc .x_h3, .x_nPrintDoc h1, .x_nPrintDoc h2, .x_nPrintDoc h3
  {margin-top:20px;
  margin-bottom:10px}
.x_nPrintDoc .x_h1 .x_small, .x_nPrintDoc .x_h1 small, .x_nPrintDoc .x_h2 .x_small, .x_nPrintDoc .x_h2 small, .x_nPrintDoc .x_h3 .x_small, .x_nPrintDoc .x_h3 small, .x_nPrintDoc h1 .x_small, .x_nPrintDoc h1 small, .x_nPrintDoc h2 .x_small, .x_nPrintDoc h2 small, .x_nPrintDoc h3 .x_small, .x_nPrintDoc h3 small
  {font-size:65%}
.x_nPrintDoc .x_h4, .x_nPrintDoc .x_h5, .x_nPrintDoc .x_h6, .x_nPrintDoc h4, .x_nPrintDoc h5, .x_nPrintDoc h6
  {margin-top:10px;
  margin-bottom:10px}
.x_nPrintDoc .x_h4 .x_small, .x_nPrintDoc .x_h4 small, .x_nPrintDoc .x_h5 .x_small, .x_nPrintDoc .x_h5 small, .x_nPrintDoc .x_h6 .x_small, .x_nPrintDoc .x_h6 small, .x_nPrintDoc h4 .x_small, .x_nPrintDoc h4 small, .x_nPrintDoc h5 .x_small, .x_nPrintDoc h5 small, .x_nPrintDoc h6 .x_small, .x_nPrintDoc h6 small
  {font-size:75%}
.x_nPrintDoc .x_h1, .x_nPrintDoc h1
  {font-size:28px}
.x_nPrintDoc .x_h2, .x_nPrintDoc h2
  {font-size:25px}
.x_nPrintDoc .x_h3, .x_nPrintDoc h3
  {font-size:20px}
.x_nPrintDoc .x_h4, .x_nPrintDoc h4
  {font-size:15px}
.x_nPrintDoc .x_h5, .x_nPrintDoc h5
  {font-size:9px}
.x_nPrintDoc .x_h6, .x_nPrintDoc h6
  {font-size:7px}
.x_nPrintDoc p
  {margin:0 0 10px}
.x_nPrintDoc .x_small, .x_nPrintDoc small
  {font-size:85%}
.x_nPrintDoc .x_text-left
  {text-align:left}
.x_nPrintDoc .x_text-right
  {text-align:right}
.x_nPrintDoc .x_text-center
  {text-align:center}
.x_nPrintDoc .x_text-lowercase
  {text-transform:lowercase}
.x_nPrintDoc .x_text-uppercase
  {text-transform:uppercase}
.x_nPrintDoc .x_text-capitalize
  {text-transform:capitalize}
.x_nPrintDoc .x_text-muted
  {color:#777}
.x_nPrintDoc .x_text-primary
  {color:#337ab7}
.x_nPrintDoc .x_text-success
  {color:#3c763d}
.x_nPrintDoc .x_text-danger
  {color:#a94442}
.x_nPrintDoc ol, .x_nPrintDoc ul
  {margin-top:0;
  margin-bottom:10px}
.x_nPrintDoc ol ol, .x_nPrintDoc ol ul, .x_nPrintDoc ul ol, .x_nPrintDoc ul ul
  {margin-bottom:0}
.x_nPrintDoc .x_list-unstyled
  {padding-left:0;
  list-style:none}
.x_nPrintDoc .x_list-inline
  {padding-left:0;
  list-style:none}
.x_nPrintDoc .x_list-inline > li
  {display:inline-block;
  padding-left:5px;
  padding-right:5px}
.x_nPrintDoc .x_btn
  {display:inline-block;
  margin-bottom:0;
  font-weight:400;
  text-align:center;
  vertical-align:middle;
  background-image:none;
  border:1px solid transparent;
  white-space:nowrap;
  padding:6px 12px;
  font-size:14px;
  line-height:1.42857143;
  border-radius:4px}
.x_nPrintDoc a.x_btn.disabled, fieldset[disabled] a.x_nPrintDoc .x_btn
  {}
.x_nPrintDoc .x_btn-default
  {color:#333;
  background-color:#fff;
  border-color:#ccc}
.x_nPrintDoc .x_btn-default .x_badge
  {color:#fff;
  background-color:#333}
.x_nPrintDoc .x_btn-primary
  {color:#fff;
  background-color:#337ab7;
  border-color:#2e6da4}
.x_nPrintDoc .x_btn-primary .x_badge
  {color:#337ab7;
  background-color:#fff}
.x_nPrintDoc .x_btn-lg
  {padding:10px 16px;
  font-size:18px;
  line-height:1.3333333;
  border-radius:6px}
.x_nPrintDoc .x_btn-sm
  {padding:5px 10px;
  font-size:12px;
  line-height:1.5;
  border-radius:3px}
.x_nPrintDoc .x_btn-block
  {display:block;
  width:100%}
.x_nPrintDoc .x_btn-block + .x_btn-block
  {margin-top:5px}
.x_nPrintDoc .x_container
  {padding-right:15px;
  padding-left:15px;
  margin-right:auto;
  margin-left:auto;
  zoom:1}
@media (min-width:768px){
.x_nPrintDoc .x_container
  {width:750px}

  }
-->
</style>
<div class="x_nPrintDoc"><div id="x_trackingnotification" class="x_container">
<h1><strong>Shipping Tracking For Order #<span class="x_text-success">${escapeHtml(orderIdPrefix)}-<span data-markjs="true" class="markxkjpt59lt" data-ogac="" data-ogab="" data-ogsc="" data-ogsb="" style="color: black !important; background-color: rgb(255, 241, 0) !important;">${escapeHtml(orderIdSuffix)}</span></span></strong></h1>
<table style="width:100%"><tbody><tr><td colspan="2"><h2>Status: <span class="x_text-primary">${escapeHtml(orderStatus)}</span></h2><h4></h4>
${purchaseOrderNumber ? `<p>PO #${escapeHtml(purchaseOrderNumber)}</p>` : ''}
<p>Date Placed: ${escapeHtml(formatDate(datePlaced))}</p>
<p>Date Invoiced: ${escapeHtml(formatDate(dateInvoiced))}</p></td>
<td><h4>Ship to</h4>
${shipAddress.Company ? `<p>${escapeHtml(shipAddress.Company)}</p>` : ''}
<p>${escapeHtml(shipToName)}</p>
<p>${escapeHtml([shipAddress.Address1, shipAddress.Address2].filter(Boolean).join(', '))}</p>
<p>${escapeHtml([shipAddress.City ? shipAddress.City.toUpperCase() : '', shipAddress.State, shipAddress.Postcode].filter(Boolean).join(' '))}</p>
<p>${escapeHtml(shipAddress.Country || 'Australia')}</p></td></tr></tbody></table>

<table style="width:100%" class="x_table"><tbody><tr><th style="text-align:left">Image</th><th style="text-align:left">Qty</th><th style="text-align:left">Description</th><th style="text-align:left">Shipping Details </th></tr>
${trackingTableRows}
</tbody></table>
${backorderSection}
</div></div><hr></div>
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