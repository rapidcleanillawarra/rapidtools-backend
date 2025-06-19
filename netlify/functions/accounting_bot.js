const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    const { maropostData, xeroData } = JSON.parse(event.body);

    if (!maropostData || !xeroData) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Missing required data: maropostData or xeroData' }),
      };
    }

    // Log the received data (replace with your processing logic)
    console.log('Received Maropost Data:', maropostData);
    console.log('Received Xero Data:', xeroData);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Data received successfully', maropostData, xeroData }),
    };
  } catch (error) {
    console.error('Error processing data:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};

module.exports = { handler }; 