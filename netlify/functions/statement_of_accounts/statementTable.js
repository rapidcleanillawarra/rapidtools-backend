/**
 * Shared statement table: single source of truth for the invoices table
 * used in both PDF statement and email HTML. Edit this file to change
 * columns, order, or row logic for both outputs.
 */

/**
 * Format currency. Optionally include $ prefix (email uses it, PDF adds it in template).
 * @param {number|null|undefined} amount
 * @param {{ includeSymbol?: boolean }} [options]
 * @returns {string}
 */
function formatCurrency(amount, options = {}) {
    const { includeSymbol = false } = options;
    if (amount === null || amount === undefined) return includeSymbol ? '$0.00' : '0.00';
    const num = parseFloat(amount);
    if (isNaN(num)) return includeSymbol ? '$0.00' : '0.00';
    const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return includeSymbol ? '$' + formatted : formatted;
}

/**
 * Format date for table cells.
 * @param {string|null|undefined} dateStr
 * @param {string} locale - e.g. 'en-US' for PDF, 'en-AU' for email
 * @returns {string}
 */
function formatDate(dateStr, locale) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        const opts = locale === 'en-AU'
            ? { day: 'numeric', month: 'short', year: 'numeric' }
            : { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString(locale, opts);
    } catch (e) {
        return 'N/A';
    }
}

/**
 * Sort invoices by datePlaced ascending (oldest first). Single place for sort logic.
 * @param {Array} invoices
 * @returns {Array}
 */
function sortInvoicesByDatePlaced(invoices) {
    return [...(invoices || [])].sort((a, b) => {
        const dateA = a.datePlaced ? new Date(a.datePlaced).getTime() : 0;
        const dateB = b.datePlaced ? new Date(b.datePlaced).getTime() : 0;
        return dateA - dateB;
    });
}

/**
 * Get normalized table data for the statement table (sorted invoices, row data, totals).
 * @param {Array} invoices - Raw invoice objects from API
 * @param {{ dateLocale?: string, includeCurrencySymbol?: boolean }} [localeOptions]
 * @returns {{ sortedInvoices: Array, rowData: Array<{ index: number, orderId: *, datePlaced: string, dueDate: string, orderTotal: string, payments: string, balance: string, isPastDue: boolean }>, grandTotal: string, dueInvoiceBalance: string }}
 */
function getStatementTableData(invoices, localeOptions = {}) {
    const dateLocale = localeOptions.dateLocale || 'en-US';
    const includeSymbol = localeOptions.includeCurrencySymbol === true;

    const sortedInvoices = sortInvoicesByDatePlaced(invoices);

    const grandTotalNum = (invoices || []).reduce((sum, inv) => sum + parseFloat(inv.outstandingAmount || 0), 0);
    const dueInvoiceBalanceNum = sortedInvoices
        .filter(inv => inv.isPastDue)
        .reduce((sum, inv) => sum + parseFloat(inv.outstandingAmount || 0), 0);

    const rowData = sortedInvoices.map((invoice, index) => {
        const paymentsSum = invoice.payments && Array.isArray(invoice.payments)
            ? invoice.payments.reduce((sum, p) => sum + parseFloat(p.Amount || 0), 0)
            : 0;
        return {
            index: index + 1,
            orderId: invoice.id,
            datePlaced: formatDate(invoice.datePlaced, dateLocale),
            dueDate: formatDate(invoice.datePaymentDue, dateLocale),
            orderTotal: formatCurrency(invoice.grandTotal, { includeSymbol }),
            payments: formatCurrency(paymentsSum, { includeSymbol }),
            balance: formatCurrency(invoice.outstandingAmount, { includeSymbol }),
            isPastDue: !!invoice.isPastDue
        };
    });

    return {
        sortedInvoices,
        rowData,
        grandTotal: formatCurrency(grandTotalNum, { includeSymbol }),
        dueInvoiceBalance: formatCurrency(dueInvoiceBalanceNum, { includeSymbol })
    };
}

/**
 * Render the full statement table HTML (thead + tbody + tfoot) for PDF or email.
 * @param {Array} invoices - Raw invoice objects
 * @param {{ mode: 'pdf'|'email', locale?: string }} options
 * @returns {string} HTML fragment for <table>...</table>
 */
function renderStatementTable(invoices, options = {}) {
    const mode = options.mode || 'pdf';
    const dateLocale = options.locale || (mode === 'email' ? 'en-AU' : 'en-US');
    const includeSymbol = mode === 'email';

    const { rowData, grandTotal, dueInvoiceBalance } = getStatementTableData(invoices, {
        dateLocale,
        includeCurrencySymbol: includeSymbol
    });

    // PDF: template adds $ in front of cell values, so we pass numbers without $
    const currencyPrefix = mode === 'pdf' ? '$' : '';

    const thead =
        `<thead>
        <tr>
            <th>#</th>
            <th>Order #</th>
            <th>Date Placed</th>
            <th>Due Date</th>
            <th class="right">Order Total</th>
            <th class="right">Payments</th>
            <th class="right">Balance AUD</th>
        </tr>
    </thead>`;

    let tbodyRows;
    if (mode === 'pdf') {
        tbodyRows = rowData.map(row => {
            const rowClass = row.isPastDue ? ' style="background-color: #fee2e2;"' : '';
            return `<tr${rowClass}>
                <td>${row.index}</td>
                <td>${row.orderId}</td>
                <td>${row.datePlaced}</td>
                <td>${row.dueDate}</td>
                <td class="right">${currencyPrefix}${row.orderTotal}</td>
                <td class="right">${currencyPrefix}${row.payments}</td>
                <td class="right">${currencyPrefix}${row.balance}</td>
            </tr>`;
        }).join('');
    } else {
        tbodyRows = rowData.map((row, index) => {
            const rowStyle = row.isPastDue
                ? 'style="background-color: #fee2e2;"'
                : `style="background-color: ${index % 2 === 0 ? '#fff' : '#f9fbfa'};"`;
            const dueDateCell = row.isPastDue
                ? `${row.dueDate} <span style="background:#dc2626;color:#fff;padding:1px 4px;border-radius:3px;font-size:10px;margin-left:4px;">Overdue</span>`
                : row.dueDate;
            const dueDateColor = row.isPastDue ? '#dc2626' : '#666';
            return `<tr ${rowStyle}>
                <td style="padding:8px 6px;text-align:center;vertical-align:middle;font-size:13px;color:#444;">${row.index}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:#333;font-weight:500;">${row.orderId}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:#666;">${row.datePlaced}</td>
                <td style="padding:8px 6px;vertical-align:middle;font-size:13px;color:${dueDateColor};">${dueDateCell}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#333;">${row.orderTotal}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#666;">${row.payments}</td>
                <td style="padding:8px 6px;text-align:right;vertical-align:middle;font-size:13px;color:#333;font-weight:600;">${row.balance}</td>
            </tr>`;
        }).join('');
    }

    const tbody = `<tbody>\n${tbodyRows}\n    </tbody>`;

    let tfoot;
    if (mode === 'pdf') {
        tfoot = `<tfoot>
        <tr class="summary-row">
            <td colspan="6" class="summary-label">GRAND TOTAL AUD</td>
            <td class="summary-value right">${currencyPrefix}${grandTotal}</td>
        </tr>
        <tr class="summary-row balance-due-row">
            <td colspan="6" class="summary-label balance-due-label">BALANCE DUE AUD</td>
            <td class="summary-value right balance-due-value">${currencyPrefix}${dueInvoiceBalance}</td>
        </tr>
    </tfoot>`;
    } else {
        tfoot = `<tfoot>
                  <tr style="background:#f9fafb;">
                    <td colspan="6" style="padding:10px 6px;text-align:right;font-size:13px;font-weight:600;color:#111;border-top:1px solid #e5e7eb;">GRAND TOTAL AUD</td>
                    <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:#111;border-top:1px solid #e5e7eb;">${grandTotal}</td>
                  </tr>
                  <tr style="background:#fef2f2;">
                    <td colspan="6" style="padding:10px 6px;text-align:right;font-size:13px;font-weight:600;color:#b91c1c;">BALANCE DUE AUD</td>
                    <td style="padding:10px 6px;text-align:right;font-size:13px;font-weight:700;color:#b91c1c;">${dueInvoiceBalance}</td>
                  </tr>
                </tfoot>`;
    }

    if (mode === 'email') {
        return `<table width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
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
                ${tbody}
                ${tfoot}
              </table>`;
    }

    return `<table>
    ${thead}
    ${tbody}
    ${tfoot}
</table>`;
}

module.exports = {
    getStatementTableData,
    renderStatementTable,
    formatCurrency,
    formatDate,
    sortInvoicesByDatePlaced
};
