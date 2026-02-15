// Power Automate endpoint URL (shared across all fetchers)
const POWER_AUTOMATE_ENDPOINT = 'https://default61576f99244849ec8803974b47673f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=pPhk80gODQOi843ixLjZtPPWqTeXIbIt9ifWZP6CJfY';

// Fetch order details from Power Automate endpoint
const fetchOrderData = async (orderId) => {
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
        "OrderLine.UnitPrice",
        "OrderLine.PercentDiscount",
        "OrderLine.ProductDiscount",
        "DatePlaced",
        "OrderStatus",
        "DatePlaced",
        "DateInvoiced",
        "PurchaseOrderNumber",
        "DeliveryInstruction",
        "PaymentTerms",
        "DatePaymentDue",
        "ShippingOption",
        "ShippingTotal",
        "ShippingDiscount",
        "OrderPayment",
        "OrderPayment.PaymentType",
        "OrderLine.Tax",
        "OrderLine.TaxCode",
        "TaxInclusive"
      ]
    },
    "action": "GetOrder"
  };

  try {
    const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
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

// Fetch related backorders using the same endpoint
const fetchRelatedBackorders = async (orderId, username) => {
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
    const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
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

// Fetch related order links (ID + RelatedOrderID) for tracing chains
const fetchRelatedOrderLinks = async (username) => {
  const payload = {
    Filter: {
      Username: username,
      OrderStatus: ['New Backorder', 'Backorder Approved', 'Dispatched'],
      OutputSelector: ['ID', 'RelatedOrderID']
    },
    action: 'GetOrder'
  };
  const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Related order links failed: ${response.status}`);
  return response.json();
};

// Fetch full details for related orders (for table: Product Total, Payments, Account Credit)
const fetchRelatedOrdersDetails = async (username, orderIds) => {
  if (!orderIds || orderIds.length === 0) return null;
  const payload = {
    Filter: {
      Username: username,
      OrderID: orderIds,
      OrderStatus: ['New Backorder', 'Backorder Approved', 'Dispatched'],
      OutputSelector: [
        'ID',
        'OrderStatus',
        'RelatedOrderID',
        'OrderLine',
        'OrderLine.OrderLineID',
        'OrderLine.ProductName',
        'OrderLine.UnitPrice',
        'OrderLine.Quantity',
        'OrderLine.Qty',
        'OrderLine.SKU',
        'OrderPayment',
        'OrderPayment.PaymentType',
        'TaxInclusive',
        'GrandTotal'
      ]
    },
    action: 'GetOrder'
  };
  const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Related orders details failed: ${response.status}`);
  return response.json();
};

// Fetch product images using the same endpoint
const fetchProductImages = async (skus) => {
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
    const response = await fetch(POWER_AUTOMATE_ENDPOINT, {
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

module.exports = {
  fetchOrderData,
  fetchRelatedBackorders,
  fetchRelatedOrderLinks,
  fetchRelatedOrdersDetails,
  fetchProductImages,
  getPreferredImage
};
