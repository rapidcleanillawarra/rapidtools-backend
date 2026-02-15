const { escapeHtml, getOrderLineSequence } = require('./utils');

// Generate HTML email template for dispatched orders
const generateDispatchEmailHTML = (orderDetails, productImages, relatedBackorders, documentId, accountUrl = 'https://www.rapidsupplies.com.au/_myacct') => {
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
              <p style="margin:10px 0 0;font-size:11px;color:#999;text-align:center;">
                Document ID: ${escapeHtml(documentId)}
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

module.exports = { generateDispatchEmailHTML };
