// Import utilities
const { escapeHtml, generateDocumentId, formatFolderDate, formatFileNameDate, traceRelatedOrderIds } = require('./utils');

// Import templates
const { generateDispatchEmailHTML } = require('./dispatch-email-template');
const { generateTaxInvoiceHTML } = require('./tax-invoice-template');

// Import fetchers
const { fetchOrderData, fetchRelatedBackorders, fetchRelatedOrderLinks, fetchRelatedOrdersDetails, fetchRmaByOrderId, fetchProductImages, getPreferredImage } = require('./fetchers');

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

    // Generate unique document ID for this request
    const documentId = generateDocumentId();

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

    // Fetch related orders (chain via ID + RelatedOrderID), then full details for table
    let relatedOrdersWithDetails = null;
    try {
      const username = orderDetails?.Order?.[0]?.Username;
      if (username) {
        const linksResponse = await fetchRelatedOrderLinks(username);
        const relatedIds = traceRelatedOrderIds(linksResponse?.Order || [], payload.OrderID);
        if (relatedIds.length > 0) {
          relatedOrdersWithDetails = await fetchRelatedOrdersDetails(username, relatedIds);
          console.log('Related orders with details fetched:', {
            main_order_id: payload.OrderID,
            related_count: relatedOrdersWithDetails?.Order?.length || 0,
            related_ids: relatedIds
          });
        }
      }
    } catch (relatedOrdersError) {
      console.error('Failed to fetch related orders for table:', relatedOrdersError.message);
    }

    // Fetch RMA (RefundTotal) for each related order for the Related Orders table
    let rmaByOrderId = {};
    if (relatedOrdersWithDetails?.Order?.length > 0) {
      const rmaResults = await Promise.allSettled(
        relatedOrdersWithDetails.Order.map((ord) => {
          const oid = ord.ID || ord.OrderID || '';
          return oid ? fetchRmaByOrderId(oid) : Promise.resolve({ Rma: '' });
        })
      );
      relatedOrdersWithDetails.Order.forEach((ord, i) => {
        const oid = ord.ID || ord.OrderID || '';
        if (!oid) return;
        const result = rmaResults[i];
        if (result.status === 'fulfilled' && result.value) {
          const rma = result.value.Rma;
          const refundTotal =
            rma && typeof rma === 'object' && rma.RefundTotal != null && rma.RefundTotal !== ''
              ? parseFloat(rma.RefundTotal)
              : 0;
          rmaByOrderId[oid] = refundTotal;
        } else {
          rmaByOrderId[oid] = 0;
        }
      });
      console.log('RMA data fetched for related orders:', { order_ids: Object.keys(rmaByOrderId), rma_by_order: rmaByOrderId });
    }

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

    // Generate HTML email template for dispatch notifications (or when testing)
    let htmlEmail = null;
    if (orderDetails) {
      try {
        htmlEmail = generateDispatchEmailHTML(orderDetails, productImages, relatedBackorders, documentId);
        console.log('HTML email template generated successfully');
      } catch (htmlError) {
        console.error('Failed to generate HTML email template:', {
          error: htmlError.message,
          stack: htmlError.stack
        });
        // Continue processing even if HTML generation fails
      }
    }

    // Generate Tax Invoice HTML template for PDF generation when Display is "pdf"
    let taxInvoiceHtml = null;
    if (orderDetails && (payload.Display === 'pdf' || payload.Display === 'data')) {
      try {
        taxInvoiceHtml = generateTaxInvoiceHTML(orderDetails, productImages, relatedBackorders, documentId, relatedOrdersWithDetails, rmaByOrderId);
        console.log('Tax Invoice HTML template generated successfully');
      } catch (invoiceError) {
        console.error('Failed to generate Tax Invoice HTML template:', {
          error: invoiceError.message,
          stack: invoiceError.stack
        });
        // Continue processing even if HTML generation fails
      }
    }

    // Check if Display field is set to "email" or "pdf" to return HTML, otherwise return JSON
    const returnHtml = payload.Display === 'email';
    const returnPdf = payload.Display === 'pdf';

    if (returnHtml) {
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
    }

    // Check if Display field is set to "pdf" to return Tax Invoice HTML
    if (returnPdf) {
      // Return Tax Invoice HTML response if HTML was generated, otherwise return a simple HTML message
      if (taxInvoiceHtml) {
        return {
          statusCode: 200,
          headers: {
            ...headers,
            'Content-Type': 'text/html'
          },
          body: taxInvoiceHtml,
        };
      }

      // Fallback HTML response if Tax Invoice HTML could not be generated
      const fallbackInvoiceHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Tax Invoice - ${escapeHtml(payload.OrderID || 'N/A')}</title>
</head>
<body>
  <h1>Tax Invoice Generation Failed</h1>
  <p>Order ID: ${escapeHtml(payload.OrderID || 'N/A')}</p>
  <p>Status: ${escapeHtml(payload.OrderStatus || 'N/A')}</p>
  <p>Event ID: ${escapeHtml(payload.EventID || 'N/A')}</p>
  <p>Tax Invoice HTML could not be generated. Order details may not be available or there was an error.</p>
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
        body: fallbackInvoiceHtml,
      };
    }

    // Check if Display field is set to "data" to return JSON with email and PDF HTML
    if (payload.Display === 'data') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          order_id: payload.OrderID,
          document_id: documentId,
          customer_email: orderDetails?.Order?.[0]?.Email || '',
          customer_username: orderDetails?.Order?.[0]?.Username || '',
          folder_name: `Sent Invoices/${formatFolderDate()}`,
          file_name: `${payload.OrderID}-${orderDetails?.Order?.[0]?.Username || ''}-${formatFileNameDate()}-${documentId}`,
          created_by: 'Power Automate',
          email_html: htmlEmail || null,
          pdf_html: taxInvoiceHtml || null
        }),
      };
    }

    // Return JSON response with order details
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Order notification processed successfully',
        order_id: payload.OrderID,
        document_id: documentId,
        customer_email: orderDetails?.Order?.[0]?.Email || '',
        order_status: payload.OrderStatus,
        event_id: payload.EventID,
        display_mode: payload.Display || 'json',
        processed: true,
        html_generated: htmlEmail !== null,
        tax_invoice_html_generated: taxInvoiceHtml !== null,
        order_details_fetched: orderDetails !== null,
        order_details: orderDetails,
        related_backorders_fetched: relatedBackorders !== null,
        related_backorders: relatedBackorders,
        product_images_fetched: productImages !== null,
        product_images: productImages,
        timestamp: payload.CurrentTime
      }),
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

module.exports = { handler, generateTaxInvoiceHTML };
