const express = require('express');
const Airtable = require('airtable');

const app = express();
app.use(express.json());

// Initialize secure cross-cloud authorization tokens using environment variables
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID);

// 🔗 PRODUCTION ENDPOINT ROUTE
app.post('/api/webhook/inventory-sync', async (req, res) => {
    console.log('📥 Inbound webhook event captured. Running enterprise multi-status ledger computation...');
    
    try {
        // 1. Fetch data across related entities to construct the cross-table link matrix
        const orderRecords = await base('Orders').select().all();
        const lineItemRecords = await base('Line Items').select().all();
        const productRecords = await base('Products').select().all();

        // Status states that actively hold a committed stock deduction
        const activeDeductionStatuses = ['Approved', 'Processing', 'Fulfilled'];

        // 2. Index active orders by BOTH their record ID and primary visible text name (1, 2, 3)
        const ordersStatusMap = {};
        orderRecords.forEach(order => {
            const status = order.get('Order Status');
            ordersStatusMap[order.id] = status;
            
            // Index by visible Order ID Name (e.g., "1", "2", "3")
            const orderIdName = order.get('Order ID') || order.get('Order Number') || order.get('Name') || order.get('order id linked');
            if (orderIdName) {
                ordersStatusMap[String(orderIdName).trim()] = status;
            }
        });

        // Index product record IDs and SKUs to map them instantly to their respective text SKU strings
        const productSkuLookupMap = {};
        productRecords.forEach(prod => {
            productSkuLookupMap[prod.id] = prod.get('SKU'); 
            
            const customSku = prod.get('SKU');
            if (customSku) {
                productSkuLookupMap[String(customSku).trim()] = customSku;
            }
        });

        // 3. Compute total historic deductions based strictly on the status of the parent Order
        const calculatedDeductions = {};

        lineItemRecords.forEach(item => {
            // Fetch your explicit 3NF link pathways precisely
            const orderLinks = item.get('Order ID Linked') || item.get('Orders') || item.get('Order') || [];
            if (!orderLinks || (Array.isArray(orderLinks) && orderLinks.length === 0)) return;

            // 🚀 FIXED STRING EXTRACTOR: Convert the array target element cleanly into a text string lookup key
            const rawOrderRef = Array.isArray(orderLinks) ? orderLinks[0] : orderLinks;
            const parentOrderId = rawOrderRef ? String(rawOrderRef).trim() : null;
            
            const orderStatus = parentOrderId ? ordersStatusMap[parentOrderId] : null;

            // Only process calculations if the parent order matches an active deduction status
            if (orderStatus && activeDeductionStatuses.includes(orderStatus)) {
                const productLinks = item.get('Product Linked') || item.get('Product') || [];
                if (!productLinks || (Array.isArray(productLinks) && productLinks.length === 0)) return;

                // Convert the product link element cleanly into a text string matching key
                const rawProductRef = Array.isArray(productLinks) ? productLinks[0] : productLinks;
                const productId = rawProductRef ? String(rawProductRef).trim() : null;
                
                // Convert the product reference into your text SKU matching identifier
                const sku = productId ? (productSkuLookupMap[productId] || productId) : null; 
                const quantity = Number(item.get('Quantity Ordered')) || Number(item.get('Quantity')) || 0;

                if (sku && quantity > 0) {
                    calculatedDeductions[sku] = (calculatedDeductions[sku] || 0) + quantity;
                }
            }
        });

        console.log('📊 Calculated Ledger Deductions Matrix:', JSON.stringify(calculatedDeductions));

        // 4. Compute the true dynamic final balance and write it safely to Committed Stock
        const updatePayload = productRecords.map(record => {
            const sku = record.get('SKU');
            const totalDeduction = calculatedDeductions[sku] || 0;
            
            return {
                id: record.id,
                fields: {
                    // 🚀 SENIOR SHIFT CONSTRAINTS: Updates your deductions cell, leaving Starting Stock locked!
                    'Committed Stock': totalDeduction
                }
            };
        });

        // 5. Bulk push the clean balance updates back to Airtable in blocks of 10 records max (Airtable API safety limit)
        if (updatePayload.length > 0) {
            for (let i = 0; i < updatePayload.length; i += 10) {
                const chunk = updatePayload.slice(i, i + 10);
                await base('Products').update(chunk);
                console.log(`📦 Pushed chunk matrix: Processed items ${i + 1} to ${Math.min(i + 10, updatePayload.length)} successfully.`);
            }
            console.log('✅ Success! Two-way multi-status inventory stock sync completed.');
            return res.status(200).json({ success: true, message: 'Stock levels synced successfully across all operational states.' });
        } else {
            return res.status(200).json({ success: true, message: 'Calculated ledger properties require zero variation.' });
        }

    } catch (error) {
        console.error('❌ Error executing multi-status ledger pipeline:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Automated Ledger Service is listening on port ${PORT}`));
