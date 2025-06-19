const handler = async (event) => {
  // Debug Response 1: Method Not Allowed (405)
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
    const { maropostData, xeroData } = JSON.parse(event.body);

    // Debug Response 2: Missing Required Data (400)
    if (!maropostData || !xeroData) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Missing required data',
          debug: {
            missing_fields: {
              maropostData: !maropostData ? 'MISSING' : 'PRESENT',
              xeroData: !xeroData ? 'MISSING' : 'PRESENT',
            },
            suggestion: 'Ensure both maropostData and xeroData are provided in the request body.',
          },
        }),
      };
    }

    // Debug Response 3: OrderID Mismatch (400)
    const maropostOrderId = maropostData.Order[0].OrderID;
    const xeroRequestedItem = xeroData.requestedItems[0];

    if (maropostOrderId !== xeroRequestedItem) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'OrderID mismatch between maropostData and xeroData',
          debug: {
            expected: xeroRequestedItem,
            received: maropostOrderId,
            suggestion: 'Verify the OrderID in maropostData matches the requestedItems in xeroData.',
          },
        }),
      };
    }

    // 4. Invoice Existence in Xero
    const exportedToXero = xeroData.foundCount > 0 && xeroData.invoices.length > 0;

    // 5. Prepare Response Data
    const maropostPaymentsSum = maropostData.Order[0].OrderPayment 
      ? maropostData.Order[0].OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
      : 0;
    const maropostGrandTotal = parseFloat(maropostData.Order[0].GrandTotal || 0);

    let maropost_paid_status;
    if (maropostGrandTotal === 0) {
      maropost_paid_status = "free";
    } else if (maropostPaymentsSum === maropostGrandTotal) {
      maropost_paid_status = "paid";
    } else if (maropostPaymentsSum > maropostGrandTotal) {
      maropost_paid_status = "overpaid";
    } else if (maropostPaymentsSum > 0) {
      maropost_paid_status = "partial";
    } else {
      maropost_paid_status = "unpaid";
    }

    // Calculate xero_paid_status first
    const xero_paid_status = exportedToXero
      ? (() => {
          const invoice = xeroData.invoices[0];
          const total = parseFloat(invoice.total || 0);
          const amountPaid = parseFloat(invoice.amountPaid || 0);
          const amountDue = parseFloat(invoice.amountDue || 0);

          if (total === amountPaid && amountDue === 0) {
            return "paid";
          } else if (amountPaid === 0 && amountDue === 0 && total === 0) {
            return "free";
          } else if (total !== amountPaid) {
            return amountDue > 0 ? "partial" : "overpaid";
          } else {
            return "unknown";
          }
        })()
      : "not_exported";

    const responseData = {
      message: 'Data received successfully',
      timestamp_utc: new Date().toISOString(),
      maropost_total: (maropostGrandTotal - maropostPaymentsSum).toFixed(2),
      maropost_paid_status,
      xero_total: exportedToXero ? xeroData.invoices[0].amountDue.toString() : "Not Yet Exported",
      difference: exportedToXero 
        ? (() => {
            const maropostRemaining = maropostGrandTotal - maropostPaymentsSum;
            const xeroAmountDue = parseFloat(xeroData.invoices[0].amountDue || 0);
            return maropostRemaining === xeroAmountDue 
              ? "0" 
              : Math.abs(maropostRemaining - xeroAmountDue).toFixed(2);
          })()
        : "Not Available",
      xero_paid_status,
      // Flattened style nodes
      xero_paid_status_background: (() => {
        switch (xero_paid_status) {
          case "paid": return "#4CAF50";      // Green
          case "free": return "#9C27B0";     // Purple
          case "partial": return "#FFC107";  // Amber
          case "overpaid": return "#FF9800"; // Orange
          case "unknown": return "#607D8B";  // Blue Grey
          default: return "#757575";         // Grey (not_exported)
        }
      })(),
      xero_paid_status_font: ["paid", "free", "unknown", "not_exported"].includes(xero_paid_status) ? "#FFFFFF" : "#000000",
      // Total comparison styling
      total_background: exportedToXero && (maropostGrandTotal - maropostPaymentsSum) !== parseFloat(xeroData.invoices[0].amountDue || 0)
        ? "#F44336" // Red for mismatch
        : "#4CAF50", // Green for match
      total_font: "#FFFFFF", // White for all cases
      debug: {
        notes: exportedToXero
          ? ((maropostGrandTotal - maropostPaymentsSum) === parseFloat(xeroData.invoices[0].amountDue || 0)
              ? "Amounts match."
              : "Amounts mismatch detected."
            )
          : "Invoice not found in Xero.",
      },
    };

    // Log the received data
    console.log('Received Maropost Data:', maropostData);
    console.log('Received Xero Data:', xeroData);

    // 6. Success Response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    // 7. Error Handling
    console.error('Error processing data:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
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