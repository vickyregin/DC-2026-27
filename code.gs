/**
 * Google Apps Script for Delivery Challan Data Storage with Analytics
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to Google Sheets and create a new spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Save the project with a name like "DC-Challan-Backend"
 * 5. Click "Deploy" > "New deployment"
 * 6. Select type: "Web app"
 * 7. Set "Execute as" to "Me"
 * 8. Set "Who has access" to "Anyone"
 * 9. Click "Deploy" and copy the Web App URL
 * 10. Paste the URL in your Angular app's googleSheetUrl variable
 * 
 * SHEETS CREATED:
 * - "Master_Data" - Complete challan records (Master Data)
 * - "Items_Detail" - Individual item details for each challan
 * - "Customer_Analytics" - Customer-wise summary and analytics
 * - "Material_Movement" - Material/Item movement tracking
 * - "Category_Summary" - CAPEX vs OPEX breakdown
 * - "Monthly_Analytics" - Month-wise analytics
 */

// Configuration - Sheet Names
const MASTER_SHEET = 'Master_Data';
const ITEMS_SHEET = 'Items_Detail';
const CUSTOMER_ANALYTICS_SHEET = 'Customer_Analytics';
const MATERIAL_MOVEMENT_SHEET = 'Material_Movement';
const CATEGORY_SUMMARY_SHEET = 'Category_Summary';
const MONTHLY_ANALYTICS_SHEET = 'Monthly_Analytics';

/**
 * Handles GET requests - used for fetching data and testing the deployment
 * Supports both regular JSON and JSONP (for CORS bypass)
 */
function doGet(e) {
  // Check if action parameter is provided (handle case when e is undefined for direct testing)
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || null;
  const callback = params.callback || null; // JSONP callback
  
  if (action === 'getData') {
    // Fetch all challan data
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const masterSheet = ss.getSheetByName(MASTER_SHEET);
      
      if (!masterSheet) {
        const response = {
          status: 'success',
          challans: [],
          message: 'No data found',
          timestamp: new Date().toISOString()
        };
        return createResponse(response, callback);
      }
      
      const data = masterSheet.getDataRange().getValues();
      const headers = data[0];
      const challans = [];
      
      // Skip header row, process data rows
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // Skip empty rows
        if (!row[1]) continue; // Skip if no challan number
        
        const challan = {
          submittedAt: formatDateValue(row[0]),
          challanNo: row[1] || '',
          challanDate: formatDateValue(row[2]),
          challanType: row[3] || '',
          category: row[4] || '',
          companyName: row[5] || '',
          companyAddress: row[6] || '',
          companyPhone: row[7] || '',
          companyEmail: row[8] || '',
          companyGstin: row[9] || '',
          consigneeName: row[10] || '',
          consigneeAddress: row[11] || '',
          consigneePhone: row[12] || '',
          consigneeGstin: row[13] || '',
          transportMode: row[14] || '',
          vehicleNo: row[15] || '',
          driverName: row[16] || '',
          driverPhone: row[17] || '',
          ewayBillNo: row[18] || '',
          poNumber: row[19] || '',
          poDate: formatDateValue(row[20]),
          totalQuantity: row[21] || 0,
          totalAmount: row[22] || 0,
          preparedBy: row[23] || '',
          remarks: row[24] || '',
          termsConditions: row[25] || '',
          items: []
        };
        
        // Fetch items for this challan from Items_Detail sheet
        const itemsSheet = ss.getSheetByName(ITEMS_SHEET);
        if (itemsSheet && itemsSheet.getLastRow() > 1) {
          const itemsData = itemsSheet.getDataRange().getValues();
          for (let j = 1; j < itemsData.length; j++) {
            if (itemsData[j][0] === challan.challanNo) {
              challan.items.push({
                slNo: itemsData[j][4] || '',
                description: itemsData[j][5] || '',
                hsnCode: itemsData[j][6] || '',
                quantity: itemsData[j][7] || 0,
                unit: itemsData[j][8] || '',
                rate: itemsData[j][9] || 0,
                gst: itemsData[j][10] || 0,
                amount: itemsData[j][11] || 0
              });
            }
          }
        }
        
        challans.push(challan);
      }
      
      // Sort by submitted date (newest first)
      challans.sort((a, b) => {
        const dateA = new Date(a.submittedAt || a.challanDate || 0).getTime();
        const dateB = new Date(b.submittedAt || b.challanDate || 0).getTime();
        return dateB - dateA;
      });
      
      const response = {
        status: 'success',
        challans: challans,
        total: challans.length,
        timestamp: new Date().toISOString()
      };
      
      return createResponse(response, callback);
      
    } catch (error) {
      const response = {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      };
      return createResponse(response, callback);
    }
  }
  
  // Default response for health check
  const response = {
    status: 'success',
    message: 'Delivery Challan API is running',
    timestamp: new Date().toISOString()
  };
  return createResponse(response, callback);
}

/**
 * Helper function to format date values from spreadsheet
 */
function formatDateValue(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

/**
 * Helper function to create response (supports both JSON and JSONP)
 */
function createResponse(data, callback) {
  const jsonString = JSON.stringify(data);
  
  if (callback) {
    // JSONP response
    return ContentService.createTextOutput(callback + '(' + jsonString + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // Regular JSON response
  return ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests - saves challan data and updates analytics
 */
function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Get spreadsheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Save to Master Data sheet
    const masterSheet = getOrCreateSheet(ss, MASTER_SHEET, getMasterDataHeaders());
    saveMasterData(masterSheet, data);
    
    // 2. Save items to Items Detail sheet
    const itemsSheet = getOrCreateSheet(ss, ITEMS_SHEET, getItemHeaders());
    saveItemsData(itemsSheet, data);
    
    // 3. Update Customer Analytics
    updateCustomerAnalytics(ss, data);
    
    // 4. Update Material Movement
    updateMaterialMovement(ss, data);
    
    // 5. Update Category Summary (CAPEX/OPEX)
    updateCategorySummary(ss, data);
    
    // 6. Update Monthly Analytics
    updateMonthlyAnalytics(ss, data);
    
    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Challan data saved and analytics updated successfully',
      challanNo: data.challanNo,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Get headers for Master Data sheet
 */
function getMasterDataHeaders() {
  return [
    'Submitted At',
    'Challan No',
    'Challan Date',
    'Challan Type',
    'Category',
    'Company Name',
    'Company Address',
    'Company Phone',
    'Company Email',
    'Company GSTIN',
    'Consignee Name',
    'Consignee Address',
    'Consignee Phone',
    'Consignee GSTIN',
    'Transport Mode',
    'Vehicle No',
    'Driver Name',
    'Driver Phone',
    'E-Way Bill No',
    'PO Number',
    'PO Date',
    'Total Quantity',
    'Total Amount',
    'Prepared By',
    'Remarks',
    'Terms & Conditions'
  ];
}

/**
 * Get headers for Items Detail sheet
 */
function getItemHeaders() {
  return [
    'Challan No',
    'Challan Date',
    'Category',
    'Consignee Name',
    'S.No',
    'Description',
    'HSN Code',
    'Quantity',
    'Unit',
    'Rate',
    'GST %',
    'Amount'
  ];
}

/**
 * Get headers for Customer Analytics sheet
 */
function getCustomerAnalyticsHeaders() {
  return [
    'Customer Name',
    'Customer GSTIN',
    'Total Challans',
    'Total Quantity',
    'Total Amount',
    'CAPEX Challans',
    'CAPEX Amount',
    'OPEX Challans',
    'OPEX Amount',
    'Returnable Count',
    'Non-Returnable Count',
    'Last Challan Date',
    'Last Updated'
  ];
}

/**
 * Get headers for Material Movement sheet
 */
function getMaterialMovementHeaders() {
  return [
    'Material Description',
    'HSN Code',
    'Total Quantity Moved',
    'Total Value',
    'CAPEX Quantity',
    'CAPEX Value',
    'OPEX Quantity',
    'OPEX Value',
    'Unique Customers',
    'Total Challans',
    'Last Movement Date',
    'Last Updated'
  ];
}

/**
 * Get headers for Category Summary sheet
 */
function getCategorySummaryHeaders() {
  return [
    'Category',
    'Total Challans',
    'Total Quantity',
    'Total Amount',
    'Returnable Count',
    'Non-Returnable Count',
    'Unique Customers',
    'Unique Materials',
    'Last Updated'
  ];
}

/**
 * Get headers for Monthly Analytics sheet
 */
function getMonthlyAnalyticsHeaders() {
  return [
    'Month',
    'Year',
    'Total Challans',
    'Total Quantity',
    'Total Amount',
    'CAPEX Challans',
    'CAPEX Amount',
    'OPEX Challans',
    'OPEX Amount',
    'Returnable Count',
    'Non-Returnable Count',
    'Unique Customers',
    'Last Updated'
  ];
}

/**
 * Get or create a sheet with headers
 */
function getOrCreateSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Add headers
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // Format headers
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4f46e5')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    // Freeze header row
    sheet.setFrozenRows(1);
    // Auto-resize columns
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }
  
  return sheet;
}

/**
 * Save master data to the Master_Data sheet
 */
function saveMasterData(sheet, data) {
  const row = [
    data.submittedAt || new Date().toISOString(),
    data.challanNo || '',
    data.challanDate || '',
    data.challanType || '',
    data.category || '',
    data.companyName || '',
    data.companyAddress || '',
    data.companyPhone || '',
    data.companyEmail || '',
    data.companyGstin || '',
    data.consigneeName || '',
    data.consigneeAddress || '',
    data.consigneePhone || '',
    data.consigneeGstin || '',
    data.transportMode || '',
    data.vehicleNo || '',
    data.driverName || '',
    data.driverPhone || '',
    data.ewayBillNo || '',
    data.poNumber || '',
    data.poDate || '',
    data.totalQuantity || 0,
    data.totalAmount || 0,
    data.preparedBy || '',
    data.remarks || '',
    data.termsConditions || ''
  ];
  
  sheet.appendRow(row);
}

/**
 * Save items data to the Items_Detail sheet
 */
function saveItemsData(sheet, data) {
  let items = data.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (e) {
      items = [];
    }
  }
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return;
  }
  
  const rows = items.map(item => [
    data.challanNo || '',
    data.challanDate || '',
    data.category || '',
    data.consigneeName || '',
    item.slNo || '',
    item.description || '',
    item.hsnCode || '',
    item.quantity || 0,
    item.unit || '',
    item.rate || 0,
    item.gst || 0,
    item.amount || 0
  ]);
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/**
 * Update Customer Analytics sheet
 */
function updateCustomerAnalytics(ss, data) {
  const sheet = getOrCreateSheet(ss, CUSTOMER_ANALYTICS_SHEET, getCustomerAnalyticsHeaders());
  const customerName = data.consigneeName || 'Unknown';
  const customerGstin = data.consigneeGstin || '';
  
  // Find existing customer row
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let customerRowIndex = -1;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === customerName) {
      customerRowIndex = i + 1;
      break;
    }
  }
  
  const isCapex = (data.category || '').toUpperCase() === 'CAPEX';
  const isReturnable = (data.challanType || '').toUpperCase() === 'RETURNABLE';
  const amount = parseFloat(data.totalAmount) || 0;
  const quantity = parseInt(data.totalQuantity) || 0;
  
  if (customerRowIndex > 0) {
    // Update existing customer
    const existingRow = values[customerRowIndex - 1];
    const updatedRow = [
      customerName,
      customerGstin || existingRow[1],
      (parseInt(existingRow[2]) || 0) + 1, // Total Challans
      (parseInt(existingRow[3]) || 0) + quantity, // Total Quantity
      (parseFloat(existingRow[4]) || 0) + amount, // Total Amount
      (parseInt(existingRow[5]) || 0) + (isCapex ? 1 : 0), // CAPEX Challans
      (parseFloat(existingRow[6]) || 0) + (isCapex ? amount : 0), // CAPEX Amount
      (parseInt(existingRow[7]) || 0) + (isCapex ? 0 : 1), // OPEX Challans
      (parseFloat(existingRow[8]) || 0) + (isCapex ? 0 : amount), // OPEX Amount
      (parseInt(existingRow[9]) || 0) + (isReturnable ? 1 : 0), // Returnable Count
      (parseInt(existingRow[10]) || 0) + (isReturnable ? 0 : 1), // Non-Returnable Count
      data.challanDate || existingRow[11], // Last Challan Date
      new Date().toISOString() // Last Updated
    ];
    sheet.getRange(customerRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
  } else {
    // Add new customer
    const newRow = [
      customerName,
      customerGstin,
      1, // Total Challans
      quantity, // Total Quantity
      amount, // Total Amount
      isCapex ? 1 : 0, // CAPEX Challans
      isCapex ? amount : 0, // CAPEX Amount
      isCapex ? 0 : 1, // OPEX Challans
      isCapex ? 0 : amount, // OPEX Amount
      isReturnable ? 1 : 0, // Returnable Count
      isReturnable ? 0 : 1, // Non-Returnable Count
      data.challanDate || '', // Last Challan Date
      new Date().toISOString() // Last Updated
    ];
    sheet.appendRow(newRow);
  }
}

/**
 * Update Material Movement sheet
 */
function updateMaterialMovement(ss, data) {
  const sheet = getOrCreateSheet(ss, MATERIAL_MOVEMENT_SHEET, getMaterialMovementHeaders());
  
  let items = data.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (e) {
      items = [];
    }
  }
  
  if (!items || !Array.isArray(items)) return;
  
  const isCapex = (data.category || '').toUpperCase() === 'CAPEX';
  
  items.forEach(item => {
    const description = item.description || 'Unknown';
    const hsnCode = item.hsnCode || '';
    const quantity = parseInt(item.quantity) || 0;
    const amount = parseFloat(item.amount) || 0;
    
    // Find existing material row
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    let materialRowIndex = -1;
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === description) {
        materialRowIndex = i + 1;
        break;
      }
    }
    
    if (materialRowIndex > 0) {
      // Update existing material
      const existingRow = values[materialRowIndex - 1];
      
      // Track unique customers (simple count increase if same material)
      const uniqueCustomers = parseInt(existingRow[8]) || 0;
      
      const updatedRow = [
        description,
        hsnCode || existingRow[1],
        (parseInt(existingRow[2]) || 0) + quantity, // Total Quantity
        (parseFloat(existingRow[3]) || 0) + amount, // Total Value
        (parseInt(existingRow[4]) || 0) + (isCapex ? quantity : 0), // CAPEX Quantity
        (parseFloat(existingRow[5]) || 0) + (isCapex ? amount : 0), // CAPEX Value
        (parseInt(existingRow[6]) || 0) + (isCapex ? 0 : quantity), // OPEX Quantity
        (parseFloat(existingRow[7]) || 0) + (isCapex ? 0 : amount), // OPEX Value
        uniqueCustomers, // Unique Customers (simplified)
        (parseInt(existingRow[9]) || 0) + 1, // Total Challans
        data.challanDate || existingRow[10], // Last Movement Date
        new Date().toISOString() // Last Updated
      ];
      sheet.getRange(materialRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
    } else {
      // Add new material
      const newRow = [
        description,
        hsnCode,
        quantity, // Total Quantity
        amount, // Total Value
        isCapex ? quantity : 0, // CAPEX Quantity
        isCapex ? amount : 0, // CAPEX Value
        isCapex ? 0 : quantity, // OPEX Quantity
        isCapex ? 0 : amount, // OPEX Value
        1, // Unique Customers
        1, // Total Challans
        data.challanDate || '', // Last Movement Date
        new Date().toISOString() // Last Updated
      ];
      sheet.appendRow(newRow);
    }
  });
}

/**
 * Update Category Summary sheet (CAPEX/OPEX)
 */
function updateCategorySummary(ss, data) {
  const sheet = getOrCreateSheet(ss, CATEGORY_SUMMARY_SHEET, getCategorySummaryHeaders());
  const category = (data.category || 'UNKNOWN').toUpperCase();
  const isReturnable = (data.challanType || '').toUpperCase() === 'RETURNABLE';
  const amount = parseFloat(data.totalAmount) || 0;
  const quantity = parseInt(data.totalQuantity) || 0;
  
  // Count unique materials
  let items = data.items;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (e) {
      items = [];
    }
  }
  const materialCount = items ? items.length : 0;
  
  // Find existing category row
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let categoryRowIndex = -1;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === category) {
      categoryRowIndex = i + 1;
      break;
    }
  }
  
  if (categoryRowIndex > 0) {
    // Update existing category
    const existingRow = values[categoryRowIndex - 1];
    const updatedRow = [
      category,
      (parseInt(existingRow[1]) || 0) + 1, // Total Challans
      (parseInt(existingRow[2]) || 0) + quantity, // Total Quantity
      (parseFloat(existingRow[3]) || 0) + amount, // Total Amount
      (parseInt(existingRow[4]) || 0) + (isReturnable ? 1 : 0), // Returnable Count
      (parseInt(existingRow[5]) || 0) + (isReturnable ? 0 : 1), // Non-Returnable Count
      (parseInt(existingRow[6]) || 0) + 1, // Unique Customers (simplified - counts transactions)
      (parseInt(existingRow[7]) || 0) + materialCount, // Unique Materials (simplified)
      new Date().toISOString() // Last Updated
    ];
    sheet.getRange(categoryRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
  } else {
    // Add new category
    const newRow = [
      category,
      1, // Total Challans
      quantity, // Total Quantity
      amount, // Total Amount
      isReturnable ? 1 : 0, // Returnable Count
      isReturnable ? 0 : 1, // Non-Returnable Count
      1, // Unique Customers
      materialCount, // Unique Materials
      new Date().toISOString() // Last Updated
    ];
    sheet.appendRow(newRow);
  }
}

/**
 * Update Monthly Analytics sheet
 */
function updateMonthlyAnalytics(ss, data) {
  const sheet = getOrCreateSheet(ss, MONTHLY_ANALYTICS_SHEET, getMonthlyAnalyticsHeaders());
  
  const challanDate = new Date(data.challanDate || new Date());
  const month = challanDate.toLocaleString('en-US', { month: 'short' });
  const year = challanDate.getFullYear();
  const monthKey = `${month} ${year}`;
  
  const isCapex = (data.category || '').toUpperCase() === 'CAPEX';
  const isReturnable = (data.challanType || '').toUpperCase() === 'RETURNABLE';
  const amount = parseFloat(data.totalAmount) || 0;
  const quantity = parseInt(data.totalQuantity) || 0;
  
  // Find existing month row
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  let monthRowIndex = -1;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === month && values[i][1] === year) {
      monthRowIndex = i + 1;
      break;
    }
  }
  
  if (monthRowIndex > 0) {
    // Update existing month
    const existingRow = values[monthRowIndex - 1];
    const updatedRow = [
      month,
      year,
      (parseInt(existingRow[2]) || 0) + 1, // Total Challans
      (parseInt(existingRow[3]) || 0) + quantity, // Total Quantity
      (parseFloat(existingRow[4]) || 0) + amount, // Total Amount
      (parseInt(existingRow[5]) || 0) + (isCapex ? 1 : 0), // CAPEX Challans
      (parseFloat(existingRow[6]) || 0) + (isCapex ? amount : 0), // CAPEX Amount
      (parseInt(existingRow[7]) || 0) + (isCapex ? 0 : 1), // OPEX Challans
      (parseFloat(existingRow[8]) || 0) + (isCapex ? 0 : amount), // OPEX Amount
      (parseInt(existingRow[9]) || 0) + (isReturnable ? 1 : 0), // Returnable Count
      (parseInt(existingRow[10]) || 0) + (isReturnable ? 0 : 1), // Non-Returnable Count
      (parseInt(existingRow[11]) || 0) + 1, // Unique Customers (simplified)
      new Date().toISOString() // Last Updated
    ];
    sheet.getRange(monthRowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
  } else {
    // Add new month
    const newRow = [
      month,
      year,
      1, // Total Challans
      quantity, // Total Quantity
      amount, // Total Amount
      isCapex ? 1 : 0, // CAPEX Challans
      isCapex ? amount : 0, // CAPEX Amount
      isCapex ? 0 : 1, // OPEX Challans
      isCapex ? 0 : amount, // OPEX Amount
      isReturnable ? 1 : 0, // Returnable Count
      isReturnable ? 0 : 1, // Non-Returnable Count
      1, // Unique Customers
      new Date().toISOString() // Last Updated
    ];
    sheet.appendRow(newRow);
  }
}

/**
 * Utility function to get all data from Master sheet
 */
function getAllMasterData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MASTER_SHEET);
  
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Utility function to get customer analytics
 */
function getCustomerAnalyticsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMER_ANALYTICS_SHEET);
  
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Utility function to get material movement data
 */
function getMaterialMovementData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(MATERIAL_MOVEMENT_SHEET);
  
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  
  return rows.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Test function - run this to verify the script is working
 */
function testScript() {
  const testData = {
    challanNo: 'TEST-001',
    challanDate: '2026-06-05',
    challanType: 'RETURNABLE',
    category: 'CAPEX',
    companyName: 'Test Company',
    companyAddress: 'Test Address',
    companyPhone: '1234567890',
    companyEmail: 'test@test.com',
    companyGstin: 'TEST123456',
    consigneeName: 'Test Consignee Ltd',
    consigneeAddress: 'Consignee Address',
    consigneePhone: '0987654321',
    consigneeGstin: 'CONSIGNEE123',
    transportMode: 'Road',
    vehicleNo: 'TN-01-AB-1234',
    driverName: 'Test Driver',
    driverPhone: '1122334455',
    ewayBillNo: 'EWAY123',
    poNumber: 'PO-001',
    poDate: '2026-06-01',
    totalQuantity: 10,
    totalAmount: 5000,
    preparedBy: 'SASI',
    remarks: 'Test remarks',
    termsConditions: 'Test terms',
    submittedAt: new Date().toISOString(),
    items: JSON.stringify([
      {
        slNo: 1,
        description: 'Machine Part A',
        hsnCode: 'HSN001',
        quantity: 5,
        unit: 'Pcs',
        rate: 500,
        gst: 18,
        amount: 2950
      },
      {
        slNo: 2,
        description: 'Bearing Set B',
        hsnCode: 'HSN002',
        quantity: 5,
        unit: 'Pcs',
        rate: 410,
        gst: 0,
        amount: 2050
      }
    ])
  };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create/get all sheets
  const masterSheet = getOrCreateSheet(ss, MASTER_SHEET, getMasterDataHeaders());
  const itemsSheet = getOrCreateSheet(ss, ITEMS_SHEET, getItemHeaders());
  
  // Save test data
  saveMasterData(masterSheet, testData);
  saveItemsData(itemsSheet, testData);
  updateCustomerAnalytics(ss, testData);
  updateMaterialMovement(ss, testData);
  updateCategorySummary(ss, testData);
  updateMonthlyAnalytics(ss, testData);
  
  Logger.log('Test data saved successfully!');
}

/**
 * Clear all data from all sheets (use with caution!)
 */
function clearAllData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [MASTER_SHEET, ITEMS_SHEET, CUSTOMER_ANALYTICS_SHEET, 
                  MATERIAL_MOVEMENT_SHEET, CATEGORY_SUMMARY_SHEET, MONTHLY_ANALYTICS_SHEET];
  
  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  });
  
  Logger.log('All data cleared!');
}

/**
 * Rebuild all analytics from Master Data
 * Use this if analytics sheets get out of sync
 */
function rebuildAnalytics() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName(MASTER_SHEET);
  
  if (!masterSheet || masterSheet.getLastRow() <= 1) {
    Logger.log('No master data to rebuild from');
    return;
  }
  
  // Clear analytics sheets
  [CUSTOMER_ANALYTICS_SHEET, MATERIAL_MOVEMENT_SHEET, CATEGORY_SUMMARY_SHEET, MONTHLY_ANALYTICS_SHEET].forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1) {
      sheet.deleteRows(2, sheet.getLastRow() - 1);
    }
  });
  
  // Get all master data
  const data = masterSheet.getDataRange().getValues();
  const headers = data[0];
  
  // Process each row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const challanData = {};
    headers.forEach((header, index) => {
      challanData[header.replace(/\s+/g, '')] = row[index];
    });
    
    // Map to expected format
    const formattedData = {
      challanNo: row[headers.indexOf('Challan No')],
      challanDate: row[headers.indexOf('Challan Date')],
      challanType: row[headers.indexOf('Challan Type')],
      category: row[headers.indexOf('Category')],
      consigneeName: row[headers.indexOf('Consignee Name')],
      consigneeGstin: row[headers.indexOf('Consignee GSTIN')],
      totalQuantity: row[headers.indexOf('Total Quantity')],
      totalAmount: row[headers.indexOf('Total Amount')],
      items: [] // Items are in separate sheet
    };
    
    // Get items for this challan
    const itemsSheet = ss.getSheetByName(ITEMS_SHEET);
    if (itemsSheet) {
      const itemsData = itemsSheet.getDataRange().getValues();
      const itemsHeaders = itemsData[0];
      const challanNoIndex = itemsHeaders.indexOf('Challan No');
      
      for (let j = 1; j < itemsData.length; j++) {
        if (itemsData[j][challanNoIndex] === formattedData.challanNo) {
          formattedData.items.push({
            description: itemsData[j][itemsHeaders.indexOf('Description')],
            hsnCode: itemsData[j][itemsHeaders.indexOf('HSN Code')],
            quantity: itemsData[j][itemsHeaders.indexOf('Quantity')],
            amount: itemsData[j][itemsHeaders.indexOf('Amount')]
          });
        }
      }
    }
    
    // Update analytics
    updateCustomerAnalytics(ss, formattedData);
    updateMaterialMovement(ss, formattedData);
    updateCategorySummary(ss, formattedData);
    updateMonthlyAnalytics(ss, formattedData);
  }
  
  Logger.log('Analytics rebuilt successfully!');
}

/**
 * Get summary dashboard data
 */
function getDashboardSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const masterSheet = ss.getSheetByName(MASTER_SHEET);
  const customerSheet = ss.getSheetByName(CUSTOMER_ANALYTICS_SHEET);
  const categorySheet = ss.getSheetByName(CATEGORY_SUMMARY_SHEET);
  
  const summary = {
    totalChallans: masterSheet ? masterSheet.getLastRow() - 1 : 0,
    totalCustomers: customerSheet ? customerSheet.getLastRow() - 1 : 0,
    categories: []
  };
  
  if (categorySheet && categorySheet.getLastRow() > 1) {
    const data = categorySheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      summary.categories.push({
        name: data[i][0],
        challans: data[i][1],
        amount: data[i][3]
      });
    }
  }
  
  Logger.log('Dashboard Summary: ' + JSON.stringify(summary));
  return summary;
}
