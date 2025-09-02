const { supabase } = require('./utils/supabaseInit');

exports.handler = async function(event, context) {
  try {
    // Validate Supabase environment variables
    const requiredVars = {
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    };

    const missingVars = Object.entries(requiredVars)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
    }

    // Validate request method
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return {
        statusCode: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Method not allowed. Use GET or POST.'
        }, null, 2)
      };
    }

    // Parse request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        }, null, 2)
      };
    }

    // No parameters required - just fetch data from Supabase

    // Fetch unresolved price mismatches from Supabase
    console.log('Fetching unresolved price mismatches from Supabase...');
    const { data: mismatches, error: fetchError } = await supabase
      .from('purchase_price_mismatches')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching price mismatches:', fetchError);
      throw new Error(`Failed to fetch price mismatches: ${fetchError.message}`);
    }

    console.log(`Found ${mismatches.length} unresolved price mismatches`);

    if (mismatches.length === 0) {
      console.log('No unresolved mismatches found');
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET,POST',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: true,
          message: 'No unresolved price mismatches found',
          total: 0,
          unresolved: 0,
          data: { unresolved: [], pricingData: [] }
        }, null, 2)
      };
    }

    // Extract SKUs for Azure Logic Apps call
    const skus = mismatches.map(item => item.sku);
    console.log(`Extracted ${skus.length} SKUs:`, skus);

    // Call Azure Logic Apps endpoint
    console.log('Calling Azure Logic Apps endpoint...');
    const azureUrl = 'https://prod-56.australiasoutheast.logic.azure.com:443/workflows/ef89e5969a8f45778307f167f435253c/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=G8m_h5Dl8GpIRQtlN0oShby5zrigLKTWEddou-zGQIs';

    const azurePayload = {
      Filter: {
        SKU: skus,
        OutputSelector: [
          "RRP",
          "PriceGroups",
          "DefaultPurchasePrice",
          "Misc02",
          "Misc09"
        ]
      },
      action: "GetItem"
    };

    let azureResponse;
    try {
      const azureFetchResponse = await fetch(azureUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(azurePayload)
      });

      if (!azureFetchResponse.ok) {
        throw new Error(`Azure endpoint returned ${azureFetchResponse.status}: ${azureFetchResponse.statusText}`);
      }

      azureResponse = await azureFetchResponse.json();
      console.log('Azure Logic Apps response received successfully');
    } catch (azureError) {
      console.error('Error calling Azure Logic Apps:', azureError);
      throw new Error(`Failed to call Azure Logic Apps: ${azureError.message}`);
    }

    // Process and combine the data
    const pricingData = azureResponse.Item || [];
    console.log(`Received pricing data for ${pricingData.length} items from Azure`);

    // Create a map for quick lookup
    const pricingMap = new Map();
    pricingData.forEach(item => {
      pricingMap.set(item.SKU, item);
    });

    // Combine Supabase data with Azure pricing data
    const combinedResults = mismatches.map(mismatch => {
      const pricingInfo = pricingMap.get(mismatch.sku);

      // Extract specific price groups
      let listPrice = null;
      let newCustomersPrice = null;

      if (pricingInfo && pricingInfo.PriceGroups && pricingInfo.PriceGroups[0] && pricingInfo.PriceGroups[0].PriceGroup) {
        const priceGroups = pricingInfo.PriceGroups[0].PriceGroup;

        // Find List Price (GroupID: "1")
        const listPriceGroup = priceGroups.find(group => group.GroupID === "1");
        if (listPriceGroup) {
          listPrice = {
            price: listPriceGroup.Price,
            promotionPrice: listPriceGroup.PromotionPrice || null,
            minimumQuantity: listPriceGroup.MinimumQuantity || null,
            maximumQuantity: listPriceGroup.MaximumQuantity || null,
            multiple: listPriceGroup.Multiple || null,
            multipleStartQuantity: listPriceGroup.MultipleStartQuantity || null
          };
        }

        // Find New Customers price (GroupID: "2")
        const newCustomersGroup = priceGroups.find(group => group.GroupID === "2");
        if (newCustomersGroup) {
          newCustomersPrice = {
            price: newCustomersGroup.Price,
            promotionPrice: newCustomersGroup.PromotionPrice || null,
            minimumQuantity: newCustomersGroup.MinimumQuantity || null,
            maximumQuantity: newCustomersGroup.MaximumQuantity || null,
            multiple: newCustomersGroup.Multiple || null,
            multipleStartQuantity: newCustomersGroup.MultipleStartQuantity || null
          };
        }
      }

      return {
        ...mismatch,
        azureData: pricingInfo || null,
        foundInAzure: !!pricingInfo,
        listPrice: listPrice,
        newCustomersPrice: newCustomersPrice
      };
    });

    console.log(`Combined ${combinedResults.length} results with Azure pricing data`);

    // Build update payload for Azure Logic Apps
    console.log('Building update payload...');
    console.log(`Total combined results: ${combinedResults.length}`);

    // Debug filtering steps
    const step1 = combinedResults.filter(item => item.foundInAzure);
    console.log(`Step 1 - Found in Azure: ${step1.length}`);

    const step2 = step1.filter(item => item.listPrice);
    console.log(`Step 2 - Has list price: ${step2.length}`);

    const step3 = step2.filter(item => item.newCustomersPrice);
    console.log(`Step 3 - Has new customers price: ${step3.length}`);

    const step4 = step3.filter(item => item.discounted_supply_price);
    console.log(`Step 4 - Has discounted supply price: ${step4.length}`);

    const updatePayload = {
      Item: step4
        .map((item, index) => {
          console.log(`=== Mapping item ${index} ===`);
          console.log(`item.sku: ${item.sku}`);
          console.log(`item.foundInAzure: ${item.foundInAzure}`);
          console.log(`item.azureData exists: ${!!item.azureData}`);
          console.log(`item.discounted_supply_price: ${item.discounted_supply_price}`);
          console.log(`item.listPrice exists: ${!!item.listPrice}`);
          console.log(`item.newCustomersPrice exists: ${!!item.newCustomersPrice}`);

          const azureData = item.azureData;

          const mappedItem = {
            SKU: item.sku,
            RRP: azureData && azureData.RRP ? parseFloat(azureData.RRP) : null,
            DefaultPurchasePrice: item.discounted_supply_price ? parseFloat(item.discounted_supply_price) : null,
            // Handle Misc02 and Misc09 with fallback logic
            Misc02: azureData && azureData.Misc02 ? azureData.Misc02.toString() : (azureData && azureData.Misc09 ? azureData.Misc09.toString() : null), // client MUP
            Misc09: azureData && azureData.Misc09 ? azureData.Misc09.toString() : (azureData && azureData.Misc02 ? azureData.Misc02.toString() : null), // retail MUP
            PriceGroups: {
              PriceGroup: [
                {
                  Group: "1", // list price
                  Price: item.listPrice.price ? parseFloat(item.listPrice.price) : null
                },
                {
                  Group: "2", // New Customers Price
                  Price: item.newCustomersPrice.price ? parseFloat(item.newCustomersPrice.price) : null
                }
              ]
            }
          };

          console.log(`=== Mapped item ${index} result ===`);
          console.log(`SKU: ${mappedItem.SKU}`);
          console.log(`RRP: ${mappedItem.RRP}`);
          console.log(`DefaultPurchasePrice: ${mappedItem.DefaultPurchasePrice}`);
          console.log(`Misc02: ${mappedItem.Misc02}`);
          console.log(`Misc09: ${mappedItem.Misc09}`);

          return mappedItem;
        })
        .filter(mappedItem => {
          const hasMiscData = mappedItem.Misc02 !== null || mappedItem.Misc09 !== null;
          const hasRRP = mappedItem.RRP !== null;
          const hasDiscountedPrice = mappedItem.DefaultPurchasePrice !== null;

          console.log(`=== Final filter check for ${mappedItem.SKU} ===`);
          console.log(`mappedItem.SKU: ${mappedItem.SKU}`);
          console.log(`mappedItem.RRP: ${mappedItem.RRP} (type: ${typeof mappedItem.RRP})`);
          console.log(`mappedItem.DefaultPurchasePrice: ${mappedItem.DefaultPurchasePrice} (type: ${typeof mappedItem.DefaultPurchasePrice})`);
          console.log(`mappedItem.Misc02: ${mappedItem.Misc02} (type: ${typeof mappedItem.Misc02})`);
          console.log(`mappedItem.Misc09: ${mappedItem.Misc09} (type: ${typeof mappedItem.Misc09})`);
          console.log(`hasMiscData=${hasMiscData}, hasRRP=${hasRRP}, hasDiscountedPrice=${hasDiscountedPrice}`);
          console.log(`Combined result: ${hasRRP && hasDiscountedPrice && hasMiscData}`);

          return hasRRP && hasDiscountedPrice && hasMiscData;
        }), // Only include complete items
      action: "UpdateItem"
    };

    // Calculate statistics for Misc02/Misc09 handling
    const miscStats = combinedResults
      .filter(item => item.foundInAzure)
      .reduce((stats, item) => {
        const azureData = item.azureData;
        if (azureData && azureData.Misc02 && azureData.Misc09) {
          stats.bothPresent++;
        } else if (azureData && azureData.Misc02 && !azureData.Misc09) {
          stats.misc02Only++;
        } else if (azureData && !azureData.Misc02 && azureData.Misc09) {
          stats.misc09Only++;
        } else {
          stats.neitherPresent++;
        }
        return stats;
      }, { bothPresent: 0, misc02Only: 0, misc09Only: 0, neitherPresent: 0 });

    console.log(`Final update payload items: ${updatePayload.Item.length}`);
    console.log('Misc02/Misc09 statistics:', miscStats);
    console.log('Update payload ready:', updatePayload);

    // Debug information to understand why payload is empty
    const debugInfo = {
      totalSupabaseItems: mismatches.length,
      totalCombinedResults: combinedResults.length,
      step1FoundInAzure: step1.length,
      step2HasListPrice: step2.length,
      step3HasNewCustomersPrice: step3.length,
      step4HasDiscountedPrice: step4.length,
      finalPayloadItems: updatePayload.Item.length,
      sampleCombinedResult: combinedResults[0] || null,
      miscStats: miscStats,
      updatePayload: updatePayload
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET,POST',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(debugInfo, null, 2)
    };

  } catch (error) {
    console.error('Error in fix-maropost-prices:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message
      }, null, 2)
    };
  }
};
