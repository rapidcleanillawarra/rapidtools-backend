const handler = async (event) => {
  // 1. HTTP Method Validation
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

    // 2. Input Validation
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

    // 3. OrderID Matching
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
    const responseData = {
      message: 'Data received successfully',
      timestamp_utc: new Date().toISOString(),
      maropost_total: maropostData.Order[0].GrandTotal,
      xero_total: exportedToXero ? xeroData.invoices[0].amountDue.toString() : "Not Yet Exported",
      difference: exportedToXero 
        ? (parseFloat(maropostData.Order[0].GrandTotal) === parseFloat(xeroData.invoices[0].amountDue) 
            ? "0" 
            : Math.abs(
                parseFloat(maropostData.Order[0].GrandTotal) - parseFloat(xeroData.invoices[0].amountDue)
              ).toFixed(2)
          )
        : "Not Available",
      debug: {
        notes: exportedToXero
          ? (parseFloat(maropostData.Order[0].GrandTotal) === parseFloat(xeroData.invoices[0].amountDue)
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