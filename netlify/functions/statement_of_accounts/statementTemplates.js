/**
 * Generate HTML statement template for a customer
 * @param {Object} customer - Customer data object with pdf_customer_name
 * @param {Array} invoices - Array of invoice objects
 * @returns {string} Complete HTML document for the PDF statement
 */
const generateStatementHTML = (customer, invoices) => {
    // Helper function to format currency with commas
    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '0.00';
        const num = parseFloat(amount);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const customerName = customer.pdf_customer_name || customer.customer_username || 'Customer';
    const totalInvoices = customer.total_orders || invoices.length;
    const totalBalance = customer.total_balance ? formatCurrency(customer.total_balance) : '0.00';
    const dueInvoiceBalance = customer.due_invoice_balance ? formatCurrency(customer.due_invoice_balance) : '0.00';
    const grandTotal = totalBalance;
    const printedDate = new Date().toLocaleString('en-AU', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Australia/Sydney'
    });

    // Calculate date range from invoices
    let dateRange = '';
    if (invoices.length > 0) {
        const dates = invoices.map(invoice => new Date(invoice.datePaymentDue)).filter(date => !isNaN(date));
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            const minFormatted = minDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            const maxFormatted = maxDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            dateRange = `From: ${minFormatted}<br>To: ${maxFormatted}`;
        }
    }

    // Sort invoices by datePlaced in ascending order (oldest first)
    const sortedInvoices = [...invoices].sort((a, b) => {
        const dateA = a.datePlaced ? new Date(a.datePlaced).getTime() : 0;
        const dateB = b.datePlaced ? new Date(b.datePlaced).getTime() : 0;
        return dateA - dateB;
    });

    // Generate order rows
    const orderRows = sortedInvoices.map((invoice, index) => {
        const orderId = invoice.id;
        const datePlaced = invoice.datePlaced ? new Date(invoice.datePlaced).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        const dueDate = invoice.datePaymentDue ? new Date(invoice.datePaymentDue).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }) : 'N/A';
        const orderTotal = invoice.grandTotal ? formatCurrency(invoice.grandTotal) : '0.00';
        const payments = invoice.payments && Array.isArray(invoice.payments)
            ? formatCurrency(invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0))
            : '0.00';
        const balance = invoice.outstandingAmount ? formatCurrency(invoice.outstandingAmount) : '0.00';
        const rowClass = invoice.isPastDue ? 'style="background-color: #fee2e2;"' : '';

        return `
            <tr ${rowClass}>
                <td>${index + 1}</td>
                <td>${orderId}</td>
                <td>${datePlaced}</td>
                <td>${dueDate}</td>
                <td class="right">$${orderTotal}</td>
                <td class="right">$${payments}</td>
                <td class="right">$${balance}</td>
            </tr>`;
    }).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Statement of Account - ${customerName}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background: #fafbfc;
                }
                .header {
                    margin-bottom: 20px;
                }
                .header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .header-content {
                    flex: 1;
                }
                .header-logo {
                    width: 200px;
                    height: auto;
                }
                .second-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 20px;
                    margin-top: 15px;
                }
                .statement-title {
                    font-size: 18px;
                    font-weight: bold;
                    color: #1a1a1a;
                }
                .address {
                    text-align: right;
                    font-size: 14px;
                    color: #1a1a1a;
                    line-height: 1.4;
                }
                .header h1 {
                    margin: 0;
                    color: #1a1a1a;
                }
                .header p {
                    margin: 5px 0;
                    color: #666;
                }
                .print-table-container {
                    display: flex;
                    justify-content: center;
                    margin-top: 30px;
                }
                table {
                    background: #fff;
                    width: 100%;
                    max-width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    margin: 0 auto;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
                }
                th, td {
                    padding: 8px 8px;
                }
                th {
                    border-bottom: 2px solid #222;
                    font-weight: bold;
                    background: #fff;
                    text-align: left;
                    font-size: 16px;
                }
                td {
                    border-bottom: 1px solid #e0e0e0;
                    font-size: 14px;
                }
                td.right, th.right {
                    text-align: right;
                }
                tr:last-child td {
                    border-bottom: 2px solid #222;
                }
                .summary-row td {
                    border: none;
                    font-size: 18px;
                    font-weight: bold;
                    background: #fff;
                    padding-top: 18px;
                    padding-bottom: 18px;
                }
                .summary-label {
                    text-align: right;
                    padding-right: 20px;
                    font-size: 18px;
                    font-weight: bold;
                    letter-spacing: 1px;
                }
                .summary-value {
                    font-size: 20px;
                    font-weight: bold;
                    color: #222;
                    text-align: right;
                    min-width: 120px;
                }
                .balance-due-row td {
                    background: #fef2f2 !important;
                }
                .balance-due-label {
                    color: #dc2626;
                    font-size: 22px;
                    letter-spacing: 2px;
                }
                .balance-due-value {
                    color: #dc2626;
                    font-size: 28px;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 5mm 5mm 5mm 5mm;
                        background: #fff;
                    }
                    .print-table-container {
                        margin-top: 0;
                    }
                    table {
                        box-shadow: none;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    th, td {
                        padding: 4px 4px !important;
                        font-size: 12px !important;
                    }
                }
                .date-range {
                    text-align: center;
                    font-size: 14px;
                    color: #1a1a1a;
                    line-height: 1.4;
                }
                .date-range-label {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-row">
                    <div class="header-content">
                        <p>Generated On: ${printedDate}</p>
                        <p>Total Invoices: ${totalInvoices}</p>
                    </div>
                    <img src="{{COMPANY_LOGO}}" alt="Rapid Supplies Logo" class="header-logo">
                </div>
                <div class="second-row">
                    <div class="statement-title">
                        Statement of Account for ${customerName}
                    </div>
                    <div class="date-range">
                        <div class="date-range-label">Date Range:</div>
                        ${dateRange}
                    </div>
                    <div class="address">
                        Rapid Illawarra Pty Ltd<br>
                        112a Industrial Road<br>
                        OAK FLATS NSW 2529<br>
                        AUSTRALIA
                    </div>
                </div>
            </div>
            <div class="print-table-container">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Order #</th>
                            <th>Date Placed</th>
                            <th>Due Date</th>
                            <th class="right">Order Total</th>
                            <th class="right">Payments</th>
                            <th class="right">Balance AUD</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${orderRows}
                    </tbody>
                    <tfoot>
                        <tr class="summary-row">
                            <td colspan="6" class="summary-label">GRAND TOTAL AUD</td>
                            <td class="summary-value right">$${grandTotal}</td>
                        </tr>
                        <tr class="summary-row balance-due-row">
                            <td colspan="6" class="summary-label balance-due-label">BALANCE DUE AUD</td>
                            <td class="summary-value right balance-due-value">$${dueInvoiceBalance}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div style="margin-top: 30px; padding: 20px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: flex-start; gap: 40px;">
                <div style="flex: 1; min-width: 220px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #1a1a1a;">Banking Details:</h3>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">IMB Shellharbour City</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">BSB: 641-800</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">A/C: 200839104</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">Name: Rapid Illawarra Pty Ltd</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #1a1a1a;">Swiftcode: ASLLAU2C</p>
                </div>
                <div style="flex: 1; min-width: 220px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;">
                    <img src='{{STRIPE_QR}}' alt='Stripe Payment QR' style='width: 140px; height: 140px; margin-bottom: 10px; border: 1px solid #eee; padding: 4px; background: #fff;' />
                    <a href='https://buy.stripe.com/dRm9AUexncD0fQacewaZi00' target='_blank' style='display: inline-block; margin-top: 8px; padding: 8px 18px; background: #635bff; color: #fff; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 500;'>Pay via Stripe</a>
                    <div style='margin-top: 6px; font-size: 12px; color: #888; text-align: center;'>Scan to pay online</div>
                </div>
            </div>
            <div style="margin-top: 40px;">
                <div style="border-top: 3px dashed #000; position: relative; margin-bottom: 20px;">
                    <span style="position: absolute; left: -18px; top: -16px; font-size: 22px; background: #fff;">✂️</span>
                </div>
                <div style="display: flex; align-items: flex-start; justify-content: space-between;">
                    <div style="flex: 1; min-width: 220px;">
                        <div style="font-size: 32px; font-weight: 500; letter-spacing: 2px; margin-bottom: 10px;">PAYMENT ADVICE</div>
                        <div style="font-size: 12px; margin-bottom: 10px;">To: Rapid Illawarra Pty Ltd<br>112a Industrial Road<br>OAK FLATS NSW 2529<br>AUSTRALIA</div>
                    </div>
                    <div style="flex: 1.2; margin-left: 40px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 18px;">
                            <tr>
                                <td style="font-weight: bold; border-bottom: 1px solid #aaa; padding-bottom: 4px;">Customer</td>
                                <td style="border-bottom: 1px solid #aaa; padding-bottom: 4px;">${customerName}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding-top: 10px;">Total Invoices</td>
                                <td style="padding-top: 10px;">${totalInvoices}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold;">Balance Due</td>
                                <td style="color: #dc2626; font-weight: bold;">$${dueInvoiceBalance}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: bold; padding-top: 18px;">Amount Enclosed</td>
                                <td style="padding-top: 18px; border-bottom: 2px solid #222;">
                                    <span style="display: block; height: 24px;"></span>
                                </td>
                            </tr>
                            <tr>
                                <td></td>
                                <td style="color: #888; font-size: 14px;">Enter the amount you are paying above</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </body>
        </html>`;
};

/**
 * Generate email HTML for a statement of account.
 * @param {Object} customer - Customer data object with pdf_customer_name
 * @param {Array} invoices - Array of invoice objects
 * @returns {string} Complete HTML email body
 */
const generateEmailHTML = (customer, invoices) => {
    // Helper function to format currency with commas and $ symbol
    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '$0.00';
        const num = parseFloat(amount);
        if (isNaN(num)) return '$0.00';
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Helper function to format dates
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) {
            return 'N/A';
        }
    };

    // Format customer name
    const customerName = customer.pdf_customer_name || customer.customer_username || 'Customer';

    // Format statement date (no time) for email copy
    const statementDate = new Date().toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Australia/Sydney'
    });

    // Sort invoices by datePlaced in ascending order (oldest first)
    const sortedInvoices = [...invoices].sort((a, b) => {
        const dateA = a.datePlaced ? new Date(a.datePlaced).getTime() : 0;
        const dateB = b.datePlaced ? new Date(b.datePlaced).getTime() : 0;
        return dateA - dateB;
    });

    // Calculate totals
    const grandTotal = invoices.reduce((sum, inv) => sum + parseFloat(inv.outstandingAmount || 0), 0);
    const dueInvoiceBalance = sortedInvoices
        .filter(invoice => invoice.isPastDue)
        .reduce((sum, inv) => sum + parseFloat(inv.outstandingAmount || 0), 0);

    // Generate invoice table rows with 7 columns
    const tableRows = sortedInvoices.map((invoice, index) => {
        const orderId = invoice.id;
        const datePlaced = formatDate(invoice.datePlaced);
        const dueDate = formatDate(invoice.datePaymentDue);
        const orderTotal = formatCurrency(invoice.grandTotal);
        const payments = invoice.payments && Array.isArray(invoice.payments)
            ? formatCurrency(invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0))
            : '$0.00';
        const balance = formatCurrency(invoice.outstandingAmount);
        const rowStyle = invoice.isPastDue
            ? 'style="background-color: #fee2e2;"'
            : `style="background-color: ${index % 2 === 0 ? '#fff' : '#f9fbfa'};"`;

        return `
            <tr ${rowStyle}>
                <td style="padding:8px 6px;text-align:center;vertical-align:middle;font-size:13px;color:#444;">${index + 1}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:#333;font-weight:500;">${orderId}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:#666;">${datePlaced}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:${invoice.isPastDue ? '#dc2626' : '#666'};">${dueDate}${invoice.isPastDue ? ' <span style="background:#dc2626;color:#fff;padding:1px 4px;border-radius:3px;font-size:10px;margin-left:4px;">Overdue</span>' : ''}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#333;">${orderTotal}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#666;">${payments}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#333;font-weight:600;">${balance}</td>
            </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement of Account</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#ffffff;color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#ffffff;border-collapse:collapse;">
    <tr>
      <td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:40px 16px 30px;background:#222222;text-align:center;">
              <img src="https://www.rapidsupplies.com.au/assets/images/company_logo_white.png" alt="RapidClean Illawarra" style="max-width:240px;height:auto;display:block;margin:0 auto 20px;" />
              <div style="font-size:28px;font-weight:700;color:#ffffff;margin-bottom:8px;letter-spacing:0.5px;">Open Statement</div>
              <div style="font-size:16px;color:#80BB3D;font-weight:600;letter-spacing:0.3px;">Account Summary for ${customerName}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0;font-size:15px;line-height:1.6;color:#222;">
              <p style="margin:0 0 10px;">Hi ${customerName},</p>
              <p style="margin:0 0 10px;">Hope you're well. This is an automated email for open statement of accounts.</p>
              <p style="margin:0 0 10px;">Please find attached your Open Statement as at ${statementDate}, which lists all currently outstanding (unpaid) invoices and any open credits on your account with RapidClean Illawarra.</p>
              <p style="margin:0 0 10px;">If payment has already been processed recently, please disregard this message and accept our thanks.</p>
              <p style="margin:0 0 10px;">If you need copies of any invoices, remittance details, or would like to query any item on the statement, please contact us at <a href="mailto:accounts@rapidcleanillawarra.com.au" style="color:#0a5ec2;text-decoration:underline;">accounts@rapidcleanillawarra.com.au</a><br>or call our office on (02) 4256 4477.</p>
              <p style="margin:0 0 12px;">Please see below a summary of the outstanding invoices and any open credits currently on your account:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
                <thead>
                  <tr style="background:#f3f4f6;">
                    <th style="padding:8px 6px;text-align:center;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">#</th>
                    <th style="padding:8px 6px;text-align:left;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Order #</th>
                    <th style="padding:8px 6px;text-align:left;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Date Placed</th>
                    <th style="padding:8px 6px;text-align:left;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Due Date</th>
                    <th style="padding:8px 6px;text-align:right;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Order Total</th>
                    <th style="padding:8px 6px;text-align:right;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Payments</th>
                    <th style="padding:8px 6px;text-align:right;font-weight:600;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">Balance AUD</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
                <tfoot>
                  <tr style="background:#f9fafb;">
                    <td colspan="6" style="padding:10px 6px;text-align:right;font-size:13px;font-weight:600;color:#111;border-top:1px solid #e5e7eb;">GRAND TOTAL AUD</td>
                    <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:#111;border-top:1px solid #e5e7eb;">${formatCurrency(grandTotal)}</td>
                  </tr>
                  <tr style="background:#fef2f2;">
                    <td colspan="6" style="padding:10px 6px;text-align:right;font-size:13px;font-weight:600;color:#b91c1c;">BALANCE DUE AUD</td>
                    <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:#b91c1c;">${formatCurrency(dueInvoiceBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0 0;">
              <div style="background:#222222;padding:3px 0;text-align:center;">
                <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Payment Options</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#f8f9fa;">
                <tr>
                  <td style="width:50%;vertical-align:middle;padding:30px;text-align:center;border-right:1px solid #e0e0e0;">
                    <div style="color:#222222;font-size:14px;font-weight:700;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Bank Transfer</div>
                    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 auto;">
                      <tr>
                        <td style="padding:3px 8px;font-size:13px;color:#666;text-align:left;">Bank</td>
                        <td style="padding:3px 8px;font-size:13px;color:#222;font-weight:600;text-align:left;">IMB Shellharbour City</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 8px;font-size:13px;color:#666;text-align:left;">BSB</td>
                        <td style="padding:3px 8px;font-size:13px;color:#222;font-weight:600;text-align:left;">641-800</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 8px;font-size:13px;color:#666;text-align:left;">Account</td>
                        <td style="padding:3px 8px;font-size:13px;color:#222;font-weight:600;text-align:left;">200839104</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 8px;font-size:13px;color:#666;text-align:left;">Name</td>
                        <td style="padding:3px 8px;font-size:13px;color:#222;font-weight:600;text-align:left;">Rapid Illawarra Pty Ltd</td>
                      </tr>
                      <tr>
                        <td style="padding:3px 8px;font-size:13px;color:#666;text-align:left;">Swift</td>
                        <td style="padding:3px 8px;font-size:13px;color:#222;font-weight:600;text-align:left;">ASLLAU2C</td>
                      </tr>
                    </table>
                  </td>
                  <td style="width:50%;vertical-align:middle;padding:30px;background:#ffffff;">
                    <div style="text-align:center;">
                      <div style="color:#222222;font-size:14px;font-weight:700;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Pay Via Stripe</div>
                      <div style="margin-bottom:16px;">
                        <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="display:inline-block;">
                          <img src="https://www.rapidsupplies.com.au/assets/images/stripe_qr.png" alt="Stripe Payment" style="width:150px;height:150px;display:block;border:2px solid #e0e0e0;">
                        </a>
                      </div>
                      <div>
                        <a href="https://buy.stripe.com/dRm9AUexncD0fQacewaZi00" style="display:inline-block;background:#80BB3D;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:4px;font-weight:700;font-size:14px;letter-spacing:0.5px;">PAY NOW</a>
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

module.exports = { generateStatementHTML, generateEmailHTML };
