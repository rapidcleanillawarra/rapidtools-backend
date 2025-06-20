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

  // Debug Response 1: Method Not Allowed (405)
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

    const { maropostData, xeroData } = JSON.parse(event.body);

    // Debug Response 2: Missing Required Data (400)
    if (!maropostData || !xeroData) {
      return {
        statusCode: 400,
        headers,
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

    // Validate maropostData structure
    if (!maropostData.Order || !Array.isArray(maropostData.Order) || maropostData.Order.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Invalid maropostData structure',
          debug: {
            issue: 'maropostData.Order must be a non-empty array',
            suggestion: 'Verify the maropostData contains a valid Order array.',
          },
        }),
      };
    }

    // Validate xeroData structure
    if (!xeroData.requestedItems || !Array.isArray(xeroData.requestedItems) || xeroData.requestedItems.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Invalid xeroData structure',
          debug: {
            issue: 'xeroData.requestedItems must be a non-empty array',
            suggestion: 'Verify the xeroData contains a valid requestedItems array.',
          },
        }),
      };
    }

    // Safe access to order data
    const order = maropostData.Order[0];
    if (!order.OrderID) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Missing OrderID in maropostData',
          debug: {
            suggestion: 'Ensure the Order contains a valid OrderID field.',
          },
        }),
      };
    }

    // Debug Response 3: OrderID Mismatch (400)
    const maropostOrderId = order.OrderID;
    const xeroRequestedItem = xeroData.requestedItems[0];

    if (maropostOrderId !== xeroRequestedItem) {
      return {
        statusCode: 400,
        headers,
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
    const exportedToXero = xeroData.foundCount > 0 && xeroData.invoices && Array.isArray(xeroData.invoices) && xeroData.invoices.length > 0;

    // 5. Prepare Response Data with safe access
    const maropostPaymentsSum = order.OrderPayment && Array.isArray(order.OrderPayment)
      ? order.OrderPayment.reduce((sum, payment) => sum + parseFloat(payment.Amount || 0), 0)
      : 0;
    const maropostGrandTotal = parseFloat(order.GrandTotal || 0);

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

    // Calculate xero_paid_status with safe access
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
          } else if (amountPaid === 0 && amountDue > 0) {
            return "unpaid";
          } else if (total !== amountPaid) {
            return amountDue > 0 ? "partial" : "overpaid";
          } else {
            return "unknown";
          }
        })()
      : "not_exported";

    // Calculate styling values
    const maropost_paid_status_background = (() => {
      switch (maropost_paid_status) {
        case "paid": return "rgb(76, 175, 80)";      // Green
        case "free": return "rgb(156, 39, 176)";     // Purple
        case "partial": return "rgb(255, 193, 7)";   // Amber
        case "overpaid": return "rgb(255, 152, 0)";  // Orange
        case "unpaid": return "rgb(244, 67, 54)";    // Red
        default: return "rgb(96, 125, 139)";         // Blue Grey
      }
    })();
    
    const maropost_paid_status_font = ["paid", "free", "unpaid"].includes(maropost_paid_status) ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
    
    const xero_paid_status_background = (() => {
      switch (xero_paid_status) {
        case "paid": return "rgb(76, 175, 80)";      // Green
        case "free": return "rgb(156, 39, 176)";     // Purple
        case "partial": return "rgb(255, 193, 7)";   // Amber
        case "overpaid": return "rgb(255, 152, 0)";  // Orange
        case "unknown": return "rgb(96, 125, 139)";  // Blue Grey
        default: return "rgb(117, 117, 117)";        // Grey (not_exported)
      }
    })();
    
    const xero_paid_status_font = ["paid", "free", "unknown", "not_exported"].includes(xero_paid_status) ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
    
    const total_background = exportedToXero && (maropostGrandTotal - maropostPaymentsSum) !== parseFloat(xeroData.invoices[0].amountDue || 0)
      ? "rgb(244, 67, 54)" // Red for mismatch
      : "rgb(76, 175, 80)"; // Green for match
    
    const total_font = "rgb(255, 255, 255)";
    
    const maropost_total = (maropostGrandTotal - maropostPaymentsSum).toFixed(2);
    const xero_total = exportedToXero ? xeroData.invoices[0].amountDue.toString() : "Not Yet Exported";
    const difference = exportedToXero 
      ? (() => {
          const maropostRemaining = maropostGrandTotal - maropostPaymentsSum;
          const xeroAmountDue = parseFloat(xeroData.invoices[0].amountDue || 0);
          return maropostRemaining === xeroAmountDue 
            ? "0" 
            : Math.abs(maropostRemaining - xeroAmountDue).toFixed(2);
        })()
      : "Not Available";
    
    const debug_notes = exportedToXero
      ? ((maropostGrandTotal - maropostPaymentsSum) === parseFloat(xeroData.invoices[0].amountDue || 0)
          ? "Amounts match."
          : "Amounts mismatch detected."
        )
      : "Invoice not found in Xero.";

    const message = 'Data received successfully';
    const timestamp_utc = new Date().toISOString();
    const timestamp_sydney = new Date().toLocaleDateString('en-AU', {
      timeZone: 'Australia/Sydney',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const responseData = {
      message,
      timestamp_utc,
      maropost_total,
      maropost_paid_status,
      xero_total,
      difference,
      xero_paid_status,
      html_template: `<p class="editor-paragraph">
<span style="color: rgb(102, 102, 102);">Timestamp (Sydney): <b><strong class="editor-text-bold">${timestamp_sydney}</strong></b></span>
</p>
<p class="editor-paragraph">
<span style="color: rgb(85, 85, 85);">Maropost Total:</span><b><strong class="editor-text-bold" style="color: rgb(85, 85, 85);"> </strong></b><b><strong class="editor-text-bold">$${maropost_total}</strong></b>

<span style="color: rgb(85, 85, 85);">Xero Total:</span> <b><strong class="editor-text-bold">${xero_total === "Not Yet Exported" ? xero_total : `$${xero_total}`}</strong></b>

<span style="color: rgb(85, 85, 85);">Difference</span>: <b><strong class="editor-text-bold">${difference === "Not Available" ? difference : `$${difference}`}</strong></b>

<span style="color: rgb(85, 85, 85);">Maropost Paid Status: </span><b><strong class="editor-text-bold" style="background-color: ${maropost_paid_status_background}; color: ${maropost_paid_status_font};">${maropost_paid_status.charAt(0).toUpperCase() + maropost_paid_status.slice(1).replace(/_/g, ' ')}</strong></b>

<span style="color: rgb(85, 85, 85);">Xero Paid Status:</span><b><strong class="editor-text-bold" style="color: rgb(85, 85, 85);"> </strong></b><b><strong class="editor-text-bold" style="background-color: ${xero_paid_status_background}; color: ${xero_paid_status_font};">${xero_paid_status.charAt(0).toUpperCase() + xero_paid_status.slice(1).replace(/_/g, ' ')}</strong></b>

Notes: <b><strong class="editor-text-bold">${debug_notes}</strong></b>
</p>`,
      debug: {
        notes: debug_notes,
      },
      maropost_paid_status_background,
      maropost_paid_status_font,
      xero_paid_status_background,
      xero_paid_status_font,
      total_background,
      total_font
    };

    // Save to Firestore (simplified data)
    try {
      const { db } = require('./utils/firebaseInit');

      // Prepare Firestore document with safe data access
      const firestoreDoc = {
        order_id: maropostOrderId,
        order_status: order.OrderStatus || 'unknown', // Fallback if OrderStatus is missing
        timestamp_utc,
        maropost_total,
        maropost_paid_status,
        xero_total,
        difference,
        xero_paid_status,
        notes: debug_notes
      };

      await db.collection('accounting_bot').add(firestoreDoc);

      console.log('Data successfully saved to Firestore:', { order_id: maropostOrderId });
    } catch (firestoreError) {
      console.error('Failed to save to Firestore:', {
        error: firestoreError.message,
        order_id: maropostOrderId,
        stack: firestoreError.stack
      });
      // Don't throw the error - continue with the response
    }

    // Log the received data
    console.log('Received Maropost Data:', maropostData);
    console.log('Received Xero Data:', xeroData);

    // 6. Success Response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    // 7. Error Handling
    console.error('Error processing data:', error);
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