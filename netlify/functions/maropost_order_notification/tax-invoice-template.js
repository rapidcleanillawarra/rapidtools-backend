const { escapeHtml, formatInvoiceDate, formatCurrency, formatShipAddress, formatBillAddress, getOrderLineSequence } = require('./utils');

// Generate HTML template for Tax Invoice PDF
const generateTaxInvoiceHTML = (orderDetails, productImages, relatedBackorders, documentId, relatedOrdersWithDetails = null) => {
  // Extract order data
  const order = orderDetails?.Order?.[0];
  if (!order) {
    return '<p>Order details not available.</p>';
  }

  const orderId = order.ID || order.OrderID || '';
  const purchaseOrderNumber = order.PurchaseOrderNumber || '';

  // Get order lines and sort by OrderLineID sequence
  const orderLines = (order.OrderLine || []).sort((a, b) => {
    const aSeq = getOrderLineSequence(a.OrderLineID);
    const bSeq = getOrderLineSequence(b.OrderLineID);
    return aSeq - bSeq;
  });

  // Calculate line item subtotals and totals
  let productSubtotal = 0;
  let totalProductDiscount = 0;
  const orderLineRows = orderLines.map(line => {
    const quantity = parseFloat(line.Quantity || line.Qty || 0);
    const unitPrice = parseFloat(line.UnitPrice || 0);
    const productDiscount = parseFloat(line.ProductDiscount || 0);
    const lineSubtotal = quantity * unitPrice;
    const discount = productDiscount;
    const discountedTotal = lineSubtotal - discount;
    productSubtotal += lineSubtotal;  // Sum of original prices (no discount applied)
    totalProductDiscount += discount;  // Track total discounts separately

    return {
      quantity: quantity,
      sku: line.SKU || '',
      productName: line.ProductName || '',
      unitPrice: unitPrice,
      discount: discount,
      subtotal: discountedTotal,
      lineSubtotal: lineSubtotal // Keep original for display if needed
    };
  });

  // Calculate GST (10%) and totals
  const shippingTotal = parseFloat(order.ShippingTotal || 0);
  const shippingDiscount = parseFloat(order.ShippingDiscount || 0);
  const shippingOption = order.ShippingOption || 'Local';
  // GST is summed from OrderLine.Tax (FRE tax-free lines have Tax: "0.00")
  const subtotalBeforeGst = (productSubtotal - totalProductDiscount) + shippingTotal - shippingDiscount;
  const gst = (orderLines || []).reduce((sum, line) => {
    return sum + parseFloat(line.Tax || 0);
  }, 0);
  const taxInclusive = String(order.TaxInclusive || '').toLowerCase() === 'true';
  const grandTotal = taxInclusive ? subtotalBeforeGst : subtotalBeforeGst + gst;

  // Calculate total amount paid from OrderPayment array (Account Credit adds to total like other payments)
  const amountPaid = (order.OrderPayment || []).reduce((total, payment) => {
    const amount = parseFloat(payment.Amount || 0);
    return total + amount;
  }, 0);

  // Determine payment terms - if fully paid, show "Paid", otherwise use original terms
  const paymentTerms = order.PaymentTerms || 'Due 30 days after EOM';
  const finalPaymentTerms = amountPaid >= grandTotal ? 'Paid' : paymentTerms;

  const balanceDue = Math.max(0, grandTotal - amountPaid);

  // Format addresses
  const shipAddressLines = formatShipAddress(order);
  const billAddressLines = formatBillAddress(order);

  // Format dates
  const dateDue = formatInvoiceDate(order.DatePaymentDue);
  const datePlaced = formatInvoiceDate(order.DatePlaced);
  const dateInvoiced = formatInvoiceDate(order.DateInvoiced);

  // Payment terms - use finalPaymentTerms which considers if order is fully paid
  const paymentTermsText = finalPaymentTerms.includes('EOM') ? 'Due 30 days after EOM' : finalPaymentTerms;

  // Generate order line items table rows
  let orderItemsRows = '';
  if (orderLineRows.length === 0) {
    orderItemsRows = `
      <tr>
        <td colspan="6" style="padding: 15px; text-align: center; color: #666; border-bottom: 1px solid #eee;">
          No items found in this order.
        </td>
      </tr>
    `;
  } else {
    orderLineRows.forEach((item, index) => {
      const rowBg = index % 2 === 0 ? '#fff' : '#f9f9f9';
      orderItemsRows += `
        <tr style="background-color: ${rowBg}; page-break-inside: avoid; break-inside: avoid;">
          <td style="padding: 10px 8px; text-align: center; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${item.quantity}</td>
          <td style="padding: 10px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(item.sku)}</td>
          <td style="padding: 10px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(item.productName)}</td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(item.unitPrice)}</td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${item.discount > 0 ? `-${formatCurrency(item.discount)}` : ''}</td>
          <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(item.subtotal)}</td>
        </tr>
      `;
    });
  }

  // Generate backorder items section
  let backorderSection = '';
  if (relatedBackorders && relatedBackorders.Order && relatedBackorders.Order.length > 0) {
    let backorderRows = '';
    relatedBackorders.Order.forEach(boOrder => {
      if (boOrder.OrderLine) {
        boOrder.OrderLine.sort((a, b) => {
          const aSeq = getOrderLineSequence(a.OrderLineID);
          const bSeq = getOrderLineSequence(b.OrderLineID);
          return aSeq - bSeq;
        });
        boOrder.OrderLine.forEach((line, index) => {
          const qty = parseFloat(line.Quantity || line.Qty || 0);
          const unitPrice = parseFloat(line.UnitPrice || 0);
          const discount = parseFloat(line.ProductDiscount || 0);
          const subtotal = qty * unitPrice - discount;
          const rowBg = index % 2 === 0 ? '#fff' : '#f9f9f9';
          backorderRows += `
            <tr style="background-color: ${rowBg}; page-break-inside: avoid; break-inside: avoid;">
              <td style="padding: 10px 8px; text-align: center; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${qty}</td>
              <td style="padding: 10px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(line.SKU || '')}</td>
              <td style="padding: 10px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(line.ProductName || '')}</td>
              <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(unitPrice)}</td>
              <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${discount > 0 ? `-${formatCurrency(discount)}` : ''}</td>
              <td style="padding: 10px 8px; text-align: right; vertical-align: top; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(subtotal)}</td>
            </tr>
          `;
        });
      }
    });

    if (backorderRows) {
      backorderSection = `
        <div style="margin-top: 30px; page-break-inside: avoid; break-inside: avoid;">
           <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
             <tr>
               <td style="background-color: #222; padding: 10px 15px; border-radius: 4px;">
                 <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #fff;">Items on backorder</h3>
               </td>
             </tr>
           </table>
           <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e0e0e0; font-size: 13px;">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="padding: 12px 8px; text-align: center; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; width: 60px;">QTY</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; width: 120px;">SKU</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Name</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; width: 100px;">Unit Price (Ex GST)</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; width: 100px;">Discount</th>
                <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd; width: 100px;">Subtotal</th>
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

  // Related orders table (Order ID, Status, Order Total, Payments, Account Credit, Amount Owed) – before calculation section
  let relatedOrdersTableHtml = '';
  if (relatedOrdersWithDetails && relatedOrdersWithDetails.Order && relatedOrdersWithDetails.Order.length > 0) {
    const relatedRows = relatedOrdersWithDetails.Order.map((ord) => {
      const oid = ord.ID || ord.OrderID || '';
      const productTotal = parseFloat(ord.GrandTotal || 0);
      const payments = (ord.OrderPayment || []).reduce(
        (sum, p) => sum + (String(p.PaymentType || '') !== 'Account Credit' ? parseFloat(p.Amount || 0) : 0),
        0
      );
      const accountCredit = (ord.OrderPayment || []).reduce(
        (sum, p) => sum + (String(p.PaymentType || '') === 'Account Credit' ? parseFloat(p.Amount || 0) : 0),
        0
      );
      const amountOwed = productTotal - payments;
      const status = ord.OrderStatus || 'N/A';
      return `
        <tr style="background-color: #fff;">
          <td style="padding: 10px 8px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(oid)}</td>
          <td style="padding: 10px 8px; text-align: left; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(status)}</td>
          <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(productTotal)}</td>
          <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(payments)}</td>
          <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(accountCredit)}</td>
          <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #333;">${formatCurrency(amountOwed)}</td>
        </tr>`;
    }).join('');
    relatedOrdersTableHtml = `
    <div style="margin-bottom: 30px; page-break-inside: avoid; break-inside: avoid;">
       <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
         <tr>
           <td style="background-color: #222; padding: 10px 15px; border-radius: 4px;">
             <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #fff;">Related Orders</h3>
           </td>
         </tr>
       </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #e0e0e0; font-size: 13px;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="padding: 12px 8px; text-align: left; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Order ID</th>
            <th style="padding: 12px 8px; text-align: left; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Status</th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Order Total</th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Payments</th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Account Credit</th>
            <th style="padding: 12px 8px; text-align: right; font-weight: 700; color: #333; border-bottom: 1px solid #ddd;">Amount Owed</th>
          </tr>
        </thead>
        <tbody>
          ${relatedRows}
        </tbody>
      </table>
    </div>`;
  }

  // Generate the HTML invoice
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice - ${escapeHtml(orderId)}</title>
  <style>
    @page { margin: 0; size: A4; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 0; color: #333; font-size: 14px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .no-print { display: none; }
  </style>
</head>
<body style="margin: 0; padding: 40px; background-color: #fff;">
  
  <div style="max-width: 800px; margin: 0 auto;">
    
    <!-- Header -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom: 40px;">
      <tr>
        <td style="width: 50%; vertical-align: top;">
           <img src="{{COMPANY_LOGO}}" alt="RapidClean Illawarra" style="max-width: 220px; height: auto; display: block; margin-bottom: 10px;">
           <div style="font-size: 12px; color: #666; line-height: 1.5;">
             <strong>RAPID ILLAWARRA PTY LTD</strong><br>
             ABN: 88 631 494 418 | ACN: 631 494 418<br>
             Ph: 02 4227 2833
           </div>
        </td>
        <td style="width: 50%; vertical-align: top; text-align: right;">
          <h1 style="margin: 0 0 10px; font-size: 32px; font-weight: 700; color: #333;">TAX INVOICE</h1>
          <div style="font-size: 16px; margin-bottom: 5px;">Invoice # <span style="color: #80BB3D; font-weight: 700;">${escapeHtml(orderId)}</span></div>
          ${purchaseOrderNumber ? `<div style="font-size: 14px; color: #666;">PO # ${escapeHtml(purchaseOrderNumber)}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- 3 Column Address & Meta Data -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom: 40px;">
      <tr>
        <!-- Column 1: Ship To -->
        <td style="width: 33%; vertical-align: top; padding-right: 20px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Ship To</div>
          <div style="font-size: 13px; line-height: 1.5;">
            ${order.ShipCompany ? `<strong>${escapeHtml(order.ShipCompany)}</strong><br>` : ''}
            ${escapeHtml(order.ShipFirstName || '')} ${escapeHtml(order.ShipLastName || '')}<br>
            ${shipAddressLines.map(line => escapeHtml(line)).join('<br>')}
          </div>
        </td>

        <!-- Column 2: Bill To -->
        <td style="width: 33%; vertical-align: top; padding-right: 20px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #888; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Bill To</div>
          <div style="font-size: 13px; line-height: 1.5;">
            ${order.BillCompany ? `<strong>${escapeHtml(order.BillCompany)}</strong><br>` : ''}
            ${escapeHtml(order.BillFirstName || '')} ${escapeHtml(order.BillLastName || '')}<br>
            ${billAddressLines.map(line => escapeHtml(line)).join('<br>')}
          </div>
        </td>

        <!-- Column 3: Invoice Meta -->
        <td style="width: 33%; vertical-align: top;">
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; border: 1px solid #eee;">
            <table cellpadding="0" cellspacing="0">
               <tr>
                 <td style="padding-bottom: 8px; font-size: 12px; color: #666;">Date Invoiced:</td>
                 <td style="padding-bottom: 8px; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(dateInvoiced)}</td>
               </tr>
               <tr>
                 <td style="padding-bottom: 8px; font-size: 12px; color: #666;">Date Placed:</td>
                 <td style="padding-bottom: 8px; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(datePlaced)}</td>
               </tr>
               <tr>
                 <td style="padding-bottom: 8px; font-size: 12px; color: #666;">Date Due:</td>
                 <td style="padding-bottom: 8px; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(dateDue)}</td>
               </tr>
               <tr>
                 <td colspan="2" style="border-top: 1px solid #ddd; padding-top: 8px; font-size: 13px; font-weight: 700; color: #d32f2f; text-align: center;">
                   ${escapeHtml(paymentTermsText)}
                 </td>
               </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>

    <!-- Instructions -->
    ${order.DeliveryInstruction ? `
    <div style="margin-bottom: 30px; background-color: #fff8e1; border: 1px solid #ffe0b2; padding: 12px 15px; border-radius: 4px;">
      <strong style="color: #f57f17; font-size: 13px;">Special Instructions:</strong> 
      <span style="font-size: 13px;">${escapeHtml(order.DeliveryInstruction)}</span>
    </div>
    ` : ''}

    <!-- Order Lines -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="background-color: #80BB3D; color: #fff;">
          <th style="padding: 12px 10px; text-align: center; font-weight: 600; border: none; border-radius: 4px 0 0 4px; width: 60px;">QTY</th>
          <th style="padding: 12px 10px; text-align: left; font-weight: 600; border: none; width: 120px;">SKU</th>
          <th style="padding: 12px 10px; text-align: left; font-weight: 600; border: none;">DESCRIPTION</th>
          <th style="padding: 12px 10px; text-align: right; font-weight: 600; border: none; width: 100px;">UNIT PRICE</th>
          <th style="padding: 12px 10px; text-align: right; font-weight: 600; border: none; width: 100px;">DISCOUNT</th>
          <th style="padding: 12px 10px; text-align: right; font-weight: 600; border: none; border-radius: 0 4px 4px 0; width: 100px;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${orderItemsRows}
      </tbody>
    </table>

    ${relatedOrdersTableHtml}

    <!-- Totals -->
    <div style="page-break-inside: avoid; break-inside: avoid;">
      <table cellpadding="0" cellspacing="0" style="margin-bottom: 40px;">
        <tr>
          <td style="width: 50%;"></td>
          <td style="width: 50%;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Freight (${escapeHtml(shippingOption)}):</td>
                <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee; width: 120px;">${formatCurrency(shippingTotal)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Product Subtotal:</td>
                <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(productSubtotal)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #d32f2f; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Total Discounts:</td>
                <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee; color: #d32f2f;">-${formatCurrency(totalProductDiscount)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">${taxInclusive ? 'GST Included:' : 'GST (10%):'}</td>
                <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(gst)}</td>
              </tr>
              ${shippingDiscount > 0 ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">Shipping Discount:</td>
                <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right; border-bottom: 1px solid #eee;">-${formatCurrency(shippingDiscount)}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 12px 0; color: #333; font-size: 16px; font-weight: 700; text-align: right; border-bottom: 2px solid #333;">Grand Total:</td>
                <td style="padding: 12px 0 12px 15px; color: #333; font-size: 16px; font-weight: 700; text-align: right; border-bottom: 2px solid #333;">${formatCurrency(grandTotal)}</td>
              </tr>
              <tr>
                 <td style="padding: 8px 0; color: #666; font-size: 13px; text-align: right;">Amount Paid:</td>
                 <td style="padding: 8px 0 8px 15px; font-weight: 600; font-size: 13px; text-align: right;">${formatCurrency(amountPaid)}</td>
              </tr>
              <tr>
                 <td style="padding: 10px 0; color: ${balanceDue === 0 ? '#28a745' : '#80BB3D'}; font-size: 18px; font-weight: ${balanceDue === 0 ? '900' : '700'}; text-align: right;">Balance Due:</td>
                 <td style="padding: 10px 0 10px 15px; color: ${balanceDue === 0 ? '#28a745' : '#80BB3D'}; font-size: 18px; font-weight: ${balanceDue === 0 ? '900' : '700'}; text-align: right;">${formatCurrency(balanceDue)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    <!-- Backorders (if any) -->
    ${backorderSection}

    <!-- Footer -->
    <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 40px; page-break-inside: avoid; break-inside: avoid;">
      <h3 style="margin: 0 0 15px; font-size: 16px; font-weight: 600; color: #333; text-align: center;">Payment Options</h3>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align: top; width: 60%; padding-right: 20px;">
              <div style="font-size: 13px; line-height: 1.6; color: #333;">
                <strong style="color: #80BB3D; font-size: 14px;">Banking Details:</strong><br><br>
                <strong>IMB Shellharbour City</strong><br>
                BSB: 641-800<br>
                A/C: 200839104<br>
                Name: Rapid Illawarra Pty Ltd<br>
                Swiftcode: ASLLAU2C
              </div>
          </td>
          <td style="vertical-align: top; width: 40%; text-align: center;">
              <div style="border: 1px solid #eee; padding: 15px; border-radius: 8px; display: inline-block; background-color: #fafafa;">
                <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="display: block; margin-bottom: 15px;">
                  <img src="{{STRIPE_QR}}" alt="Stripe Payment QR" style="width: 140px; height: 140px; border: 1px solid #eee; padding: 4px; background: #fff; display: block; margin-left: auto; margin-right: auto;">
                </a>
                <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="background-color: #80BB3D; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 600; font-size: 14px; display: inline-block; margin-bottom: 10px;">Pay Online</a>
                <div style="font-size: 11px; color: #666; word-break: break-all;">
                  <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="color: #666; text-decoration: underline;">https://buy.stripe.com/dRm9AUexncD0fQacewaZi00</a>
                </div>
              </div>
          </td>
        </tr>
      </table>
      <div style="margin-top: 30px; text-align: center; color: #777; font-size: 12px;">
          <p>Thank you for your business!</p>
          <p style="margin: 8px 0 0; font-size: 10px; color: #999;">Document ID: ${escapeHtml(documentId)}</p>
      </div>
    </div>

  </div>
</body>
</html>
  `.trim();

  return html;
};

module.exports = { generateTaxInvoiceHTML };
