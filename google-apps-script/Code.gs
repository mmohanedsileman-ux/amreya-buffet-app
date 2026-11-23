// ============================================================================
// كود الربط التلقائي لبوفية اسمنت العامرية (إصدار خفيف جداً + كاش 60 ثانية + جرس بدون ثقل)
// الصق هذا الكود بالكامل في: Google Sheets -> Extensions (الإضافات) -> Apps Script
// ============================================================================

/**
 * 1. قائمة الجرس في شريط جوجل شيت
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🔔 جرس البوفيه')
      .addItem('🔊 تشغيل جرس تنبيه الطلبات الجديدة', 'openOrderBellSidebar')
      .addToUi();
  } catch (e) {}
}

/**
 * إيجاد آخر صف فعلي في العمود A بسرعة فائقة بدون قراءة الشيت بالكامل
 */
function findLastOrderRowFast_(sheet, props) {
  var maxRows = sheet.getMaxRows();
  var cached = parseInt(props.getProperty('LAST_ORDER_ROW') || '0', 10);

  if (cached >= 2 && cached <= maxRows) {
    var winStart = Math.max(2, cached - 3);
    var winLen = Math.min(20, maxRows - winStart + 1);
    var winVals = sheet.getRange(winStart, 1, winLen, 1).getValues();

    var hasAnyFilled = false;
    var lastFilledInWin = -1;
    var hasEmptyAfterFilled = false;

    for (var w = 0; w < winVals.length; w++) {
      var v = winVals[w][0];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        hasAnyFilled = true;
        lastFilledInWin = winStart + w;
        hasEmptyAfterFilled = false;
      } else if (hasAnyFilled) {
        hasEmptyAfterFilled = true;
      }
    }

    if (lastFilledInWin >= 2 && (hasEmptyAfterFilled || lastFilledInWin === maxRows)) {
      if (lastFilledInWin !== cached) {
        props.setProperty('LAST_ORDER_ROW', String(lastFilledInWin));
      }
      return lastFilledInWin;
    }
  }

  // المسار الاحتياطي (أول مرة فقط)
  var colA = sheet.getRange(1, 1, maxRows, 1).getValues();
  var lastRow = 1;
  for (var i = colA.length - 1; i >= 1; i--) {
    var cellVal = colA[i][0];
    if (cellVal !== null && cellVal !== undefined && String(cellVal).trim() !== '') {
      lastRow = i + 1;
      break;
    }
  }
  props.setProperty('LAST_ORDER_ROW', String(lastRow));
  return lastRow;
}

/**
 * 2. استقبال الطلبات والعملاء الجدد بأقصى سرعة ممكنة
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(12000);
  } catch (lockErr) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      error: "الشيت مشغول حالياً، يرجى إعادة المحاولة"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    var data = {};

    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var isCustomerSync = data.type === 'new_customer' || data.type === 'customers' ||
                         data.action === 'append_customer' ||
                         (data.sheetName && data.sheetName.indexOf('عملاء') !== -1) ||
                         (data.sheetName && data.sheetName.indexOf('أرصدة') !== -1);

    // أ) العملاء الجدد
    if (isCustomerSync) {
      var custSheet = ss.getSheetByName("أرصدة ومديونيات العملاء")
                   || ss.getSheetByName("العملاء_والحسابات")
                   || ss.getSheetByName("العملاء والحسابات");
      if (!custSheet) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "شيت العملاء غير موجود"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var custRow = data.row || (data.values && data.values[0]);
      if (!custRow || !Array.isArray(custRow)) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "بيانات العميل غير صالحة"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var newCustId = String(custRow[0] || '').trim();
      var newEmpCode = String(custRow[9] || '').trim();
      var existingData = custSheet.getDataRange().getValues();
      for (var ex = 1; ex < existingData.length; ex++) {
        var exId = String(existingData[ex][0] || '').trim();
        var exName = String(existingData[ex][1] || '').trim();
        var exCode = String(existingData[ex][9] || '').trim();
        if ((newCustId && exId === newCustId) ||
            (newEmpCode && exCode === newEmpCode) ||
            (newEmpCode && exName.indexOf(newEmpCode) !== -1)) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "already_exists",
            row: ex + 1
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      var colACust = custSheet.getRange("A1:A").getValues();
      var nextCustRow = colACust.length + 1;
      for (var c = 1; c < colACust.length; c++) {
        var val = colACust[c][0];
        if (val === null || val === undefined || String(val).trim() === "") {
          nextCustRow = c + 1;
          break;
        }
      }

      custSheet.getRange(nextCustRow, 1, 1, custRow.length).setValues([custRow]);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        type: "customer",
        row: nextCustRow
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ب) طلبات البوفيه -> سجل_الطلبات (الأعمدة A إلى H فقط لحماية مربعات الاختيار)
    var sheet = ss.getSheetByName("سجل_الطلبات")
             || ss.getSheetByName("سجل الطلبات")
             || ss.getSheets()[0];

    var row = data.row;
    if (!row && data.orderId) {
      row = [
        data.orderId,
        data.date || new Date().toLocaleString('ar-EG'),
        data.customerName || 'عميل نقدي',
        data.items || '',
        data.total || 0,
        data.paymentMethod || 'نقدي',
        data.paymentStatus || 'مسدد فوراً',
        data.notes || ''
      ];
    }

    if (!row || !Array.isArray(row)) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "بيانات الطلب غير صالحة"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var orderCode = String(row[0]).trim();
    var lastFilledRow = findLastOrderRowFast_(sheet, props);

    // فحص تكرار رقم الطلب في آخر 35 صفاً فقط
    if (lastFilledRow >= 2 && orderCode) {
      var dupStart = Math.max(2, lastFilledRow - 34);
      var dupCount = lastFilledRow - dupStart + 1;
      var recentIds = sheet.getRange(dupStart, 1, dupCount, 1).getValues();
      for (var j = 0; j < recentIds.length; j++) {
        if (recentIds[j][0] && String(recentIds[j][0]).trim() === orderCode) {
          return ContentService.createTextOutput(JSON.stringify({
            status: "already_exists",
            row: dupStart + j
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    var nextRow = lastFilledRow + 1;
    var orderCols = row.slice(0, 8);
    sheet.getRange(nextRow, 1, 1, orderCols.length).setValues([orderCols]);

    // حفظ آخر صف + إشارة الجرس في الذاكرة السريعة (حتى لا يضطر الجرس لقراءة الشيت أبداً!)
    try {
      props.setProperty('LAST_ORDER_ROW', String(nextRow));
      var recentRaw = props.getProperty('RECENT_ORDERS_SIGNAL');
      var recentList = [];
      if (recentRaw) {
        try { recentList = JSON.parse(recentRaw); } catch (eParse) { recentList = []; }
      }
      if (!Array.isArray(recentList)) recentList = [];

      recentList.unshift({
        orderId: orderCode,
        time: String(orderCols[1] || ''),
        customerName: String(orderCols[2] || 'عميل نقدي'),
        items: String(orderCols[3] || ''),
        total: orderCols[4] || 0,
        paymentMethod: String(orderCols[5] || ''),
        notes: String(orderCols[7] || ''),
        row: nextRow,
        ts: Date.now()
      });
      if (recentList.length > 8) recentList = recentList.slice(0, 8);
      props.setProperty('RECENT_ORDERS_SIGNAL', JSON.stringify(recentList));
    } catch (sigErr) {}

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      type: "order",
      row: nextRow
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * 3. دالة القراءة للتطبيق (محمية بكاش RAM لمدة 60 ثانية لتخفيف الضغط 98% عن الشيت!)
 */
function doGet(e) {
  try {
    var cache = CacheService.getScriptCache();
    var forceFresh = e && e.parameter && e.parameter.fresh === '1';

    // إرجاع النسخة المخزنة في الرام خلال 40 مللي ثانية بدون لمس جوجل شيت نهائياً!
    if (!forceFresh) {
      var cachedJson = cache.get('CAFE_SYNC_JSON_V2');
      if (cachedJson) {
        return ContentService.createTextOutput(cachedJson).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. الأصناف
    var menuSheet = ss.getSheetByName("قائمة_الأصناف")
                 || ss.getSheetByName("قائمة الأصناف")
                 || ss.getSheetByName("المنيو");
    var items = [];
    if (menuSheet) {
      var data = menuSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var code = String(row[0] || '').trim();
        var categoryName = String(row[1] || '').trim();
        var name = String(row[2] || '').trim();
        var price = parseFloat(String(row[3] || '0').replace(/[^0-9.]/g, '')) || 0;
        var rawStatus = row[4];
        var status = String(rawStatus !== undefined && rawStatus !== null ? rawStatus : '').trim();
        if (name && name !== 'اسم الصنف') {
          items.push({
            id: code ? 'item-' + code.toLowerCase().replace(/[^a-z0-9_-]/g, '') : ('item-sheet-' + (i + 1)),
            code: code,
            categoryName: categoryName,
            name: name,
            price: price,
            available: !(status.indexOf('غير') !== -1 || status === 'لا' || status === '0' || status.toLowerCase() === 'false' || status.indexOf('نفد') !== -1 || status.indexOf('معطل') !== -1 || rawStatus === false)
          });
        }
      }
    }

    // 2. حالة سداد الفواتير (آخر 400 طلب فقط لسرعة القراءة الفائقة)
    var ordersSheet = ss.getSheetByName("سجل_الطلبات") || ss.getSheetByName("سجل الطلبات");
    var paidOrderIds = [];
    var customerDebts = {};
    if (ordersSheet) {
      var props = PropertiesService.getScriptProperties();
      var lastOrderRow = findLastOrderRowFast_(ordersSheet, props);
      if (lastOrderRow >= 2) {
        var startOrderRow = Math.max(2, lastOrderRow - 399);
        var ordersData = ordersSheet.getRange(startOrderRow, 1, lastOrderRow - startOrderRow + 1, 10).getValues();
        for (var k = 0; k < ordersData.length; k++) {
          var oId = String(ordersData[k][0] || '').trim();
          var cName = String(ordersData[k][2] || '').trim();
          var amt = parseFloat(ordersData[k][4]) || 0;
          var pMethod = String(ordersData[k][5] || '').trim();
          var pStatus = String(ordersData[k][6] || '').trim();
          var isPaidColJ = ordersData[k][9];
          var isPaid = isPaidColJ === true || String(isPaidColJ).toLowerCase() === 'true' || pStatus.indexOf('مسدد') !== -1;

          if (oId && isPaid) paidOrderIds.push(oId);
          if (cName && (pMethod.indexOf('آجل') !== -1 || pMethod.indexOf('أجل') !== -1 || pStatus.indexOf('معلق') !== -1)) {
            if (customerDebts[cName] === undefined) customerDebts[cName] = 0;
            if (!isPaid) customerDebts[cName] += amt;
          }
        }
      }
    }

    // 3. قراءة العملاء والموظفين من "أرصدة ومديونيات العملاء"
    var custSheet = ss.getSheetByName("أرصدة ومديونيات العملاء")
                 || ss.getSheetByName("العملاء_والحسابات")
                 || ss.getSheetByName("العملاء والحسابات");
    var customersList = [];
    if (custSheet) {
      var lastCustRow = custSheet.getLastRow();
      if (lastCustRow >= 2) {
        var custData = custSheet.getRange(2, 1, lastCustRow - 1, 10).getValues();
        for (var c = 0; c < custData.length; c++) {
          var rowC = custData[c];
          var custId = String(rowC[0] || '').trim();
          var custName = String(rowC[1] || '').trim();
          var category = String(rowC[2] || 'موظف').trim();
          var totalOrders = parseFloat(rowC[3]) || 0;
          var totalPaid = parseFloat(rowC[4]) || 0;
          var remainingDebt = parseFloat(rowC[5]) || 0;
          var statusC = String(rowC[6] || (remainingDebt > 0 ? 'مدين' : 'خالص')).trim();
          var dept = String(rowC[7] || '').trim();
          var phone = String(rowC[8] || '').trim();
          var empCode = String(rowC[9] || '').trim();

          if (!empCode && custName) {
            var mCode = custName.match(/(\d{4,5})/);
            if (mCode) empCode = mCode[1];
          }

          if (custName && custName !== 'اسم العميل / الموظف') {
            customersList.push({
              id: custId || ('CUST-' + (c + 1)),
              name: custName,
              code: empCode || custId,
              category: category || 'موظف',
              totalOrders: totalOrders,
              totalPaid: totalPaid,
              remainingDebt: remainingDebt,
              status: statusC,
              department: dept,
              phone: phone,
              creditLimit: 500
            });
          }
        }
      }
    }

    var jsonOut = JSON.stringify({
      status: "online",
      message: "نظام بوفية اسمنت العامرية متصل وجاهز بنجاح",
      menuItems: items,
      paidOrderIds: paidOrderIds,
      customerDebts: customerDebts,
      customers: customersList
    });

    // تخزين في الكاش لمدة 60 ثانية (حجم أقصى 100KB في ScriptCache)
    try {
      if (jsonOut.length < 95000) {
        cache.put('CAFE_SYNC_JSON_V2', jsonOut, 60);
      }
    } catch (cacheErr) {}

    return ContentService.createTextOutput(jsonOut).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "online",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// 4. جرس التنبيه الخفيف جداً (لا يفتح الشيت أثناء المراقبة -> صفر بطء على الشيت!)
// ============================================================================

/**
 * قراءة فورية من الذاكرة فقط (15 مللي ثانية - صفر ضغط على جوجل شيت!)
 */
function getLatestOrderSignals(forceReadSheet) {
  try {
    var props = PropertiesService.getScriptProperties();
    var lastRowCached = parseInt(props.getProperty('LAST_ORDER_ROW') || '0', 10);

    if (!forceReadSheet) {
      var recentRaw = props.getProperty('RECENT_ORDERS_SIGNAL');
      if (recentRaw) {
        var list = JSON.parse(recentRaw);
        if (Array.isArray(list) && list.length > 0) {
          return { orders: list, lastRow: lastRowCached || list[0].row || 0, source: 'memory' };
        }
      }
    }

    // يقرأ من الشيت مرة واحدة فقط عند أول فتح أو عند الضغط على زر التحديث اليدوي
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("سجل_الطلبات") || ss.getSheetByName("سجل الطلبات") || ss.getSheets()[0];
    if (!sheet) return { orders: [], lastRow: 0, source: 'sheet' };

    var lastRow = findLastOrderRowFast_(sheet, props);
    if (lastRow < 2) return { orders: [], lastRow: 0, source: 'sheet' };

    var startRow = Math.max(2, lastRow - 7);
    var count = lastRow - startRow + 1;
    var rows = sheet.getRange(startRow, 1, count, 8).getValues();
    var orders = [];

    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      var oId = String(r[0] || '').trim();
      if (!oId) continue;
      orders.push({
        orderId: oId,
        time: r[1] instanceof Date ? Utilities.formatDate(r[1], "Africa/Cairo", "HH:mm") : String(r[1] || ''),
        customerName: String(r[2] || 'عميل نقدي'),
        items: String(r[3] || ''),
        total: r[4] || 0,
        paymentMethod: String(r[5] || ''),
        notes: String(r[7] || ''),
        row: startRow + i
      });
    }

    // حفظها في الذاكرة حتى تكون كل الفحوصات التالية بدون لمس الشيت
    try {
      if (orders.length > 0) {
        props.setProperty('RECENT_ORDERS_SIGNAL', JSON.stringify(orders));
      }
    } catch (eSave) {}

    return { orders: orders, lastRow: lastRow, source: 'sheet' };
  } catch (err) {
    return { orders: [], lastRow: 0, error: err.toString() };
  }
}

/**
 * فتح الشريط الجانبي لجرس التنبيه (يفحص الذاكرة فقط كل 6 ثوانٍ بدون أي ثقل على الشيت)
 */
function openOrderBellSidebar() {
  var htmlContent = ''
    + '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">'
    + '<style>'
    + 'body{font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#0f172a;color:#f8fafc;margin:0;padding:14px;}'
    + '.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:12px;}'
    + '.title{font-size:16px;font-weight:700;margin:0 0 6px;display:flex;align-items:center;gap:8px;}'
    + '.sub{font-size:12px;color:#94a3b8;margin:0;}'
    + '.btn{width:100%;padding:11px 14px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;}'
    + '.btn-start{background:#10b981;color:#052e16;}'
    + '.btn-stop{background:#ef4444;color:#ffffff;}'
    + '.btn-test{background:#334155;color:#f8fafc;}'
    + '.status{display:block;padding:6px 10px;border-radius:10px;font-size:12px;font-weight:700;margin-top:8px;text-align:center;}'
    + '.status-on{background:#064e3b;color:#6ee7b7;}'
    + '.status-off{background:#3f1d1d;color:#fca5a5;}'
    + '.opt{display:flex;align-items:center;justify-content:space-between;font-size:13px;margin-top:10px;color:#cbd5e1;}'
    + '.live-meta{font-size:11px;color:#64748b;margin-top:8px;text-align:center;}'
    + '.order-item{background:#0f172a;border-right:4px solid #f59e0b;border-radius:8px;padding:10px;margin-top:8px;font-size:12.5px;line-height:1.6;}'
    + '.order-new{border-right-color:#10b981;animation:flash 1s ease-in-out 3;}'
    + '@keyframes flash{0%,100%{background:#0f172a;}50%{background:#065f46;}}'
    + '.meta{color:#94a3b8;font-size:11px;display:flex;justify-content:space-between;}'
    + '.cust{font-weight:700;color:#fbbf24;font-size:13.5px;}'
    + '</style></head><body>'
    + '<div class="card">'
    + '  <div class="title">🔔 جرس طلبات بوفية العامرية</div>'
    + '  <p class="sub">وضع فائق الخفة — لا يؤثر على سرعة الشيت أبداً.</p>'
    + '  <div id="statusBadge" class="status status-off">⏸️ متوقف — اضغط تشغيل لتفعيل الصوت</div>'
    + '  <button id="toggleBtn" class="btn btn-start" onclick="toggleBell()">🔊 تشغيل جرس التنبيه الآن</button>'
    + '  <button class="btn btn-test" onclick="playBellSound(true)">🔔 تجربة صوت الجرس</button>'
    + '  <div class="opt">'
    + '    <label for="repeatMode">تكرار الرنة للزحمة:</label>'
    + '    <select id="repeatMode" style="background:#0f172a;color:#fff;border:1px solid #475569;border-radius:6px;padding:4px 8px;">'
    + '      <option value="1">رنة واحدة (دنج دونج)</option>'
    + '      <option value="2" selected>رنتان متتاليتان (واضح)</option>'
    + '      <option value="3">3 رنات قوية</option>'
    + '    </select>'
    + '  </div>'
    + '  <div id="liveMeta" class="live-meta">جاهز للتشغيل</div>'
    + '</div>'
    + '<div class="card">'
    + '  <div class="title" style="font-size:14px;">📋 أحدث الطلبات الواردة</div>'
    + '  <div id="ordersList"><p class="sub">اضغط تشغيل لعرض ومراقبة أحدث الطلبات...</p></div>'
    + '</div>'
    + '<script>'
    + 'var audioCtx = null;'
    + 'var isRunning = false;'
    + 'var pollTimer = null;'
    + 'var inFlight = false;'
    + 'var knownIds = {};'
    + 'var initialized = false;'
    + ''
    + 'function ensureAudio() {'
    + '  var Ctx = window.AudioContext || window.webkitAudioContext;'
    + '  if (!audioCtx && Ctx) audioCtx = new Ctx();'
    + '  if (audioCtx && audioCtx.state === "suspended") {'
    + '    audioCtx.resume().catch(function(){});'
    + '  }'
    + '}'
    + ''
    + 'function playSingleChime(startTime) {'
    + '  if (!audioCtx) return;'
    + '  var notes = ['
    + '    { freq: 880, offset: 0.00, dur: 0.45 },'
    + '    { freq: 1318.5, offset: 0.00, dur: 0.35 },'
    + '    { freq: 659.25, offset: 0.22, dur: 0.65 },'
    + '    { freq: 987.77, offset: 0.22, dur: 0.50 }'
    + '  ];'
    + '  for (var i = 0; i < notes.length; i++) {'
    + '    var n = notes[i];'
    + '    var osc = audioCtx.createOscillator();'
    + '    var gain = audioCtx.createGain();'
    + '    osc.type = i % 2 === 0 ? "triangle" : "sine";'
    + '    osc.frequency.setValueAtTime(n.freq, startTime + n.offset);'
    + '    gain.gain.setValueAtTime(0.001, startTime + n.offset);'
    + '    gain.gain.exponentialRampToValueAtTime(0.48, startTime + n.offset + 0.02);'
    + '    gain.gain.exponentialRampToValueAtTime(0.001, startTime + n.offset + n.dur);'
    + '    osc.connect(gain);'
    + '    gain.connect(audioCtx.destination);'
    + '    osc.start(startTime + n.offset);'
    + '    osc.stop(startTime + n.offset + n.dur + 0.05);'
    + '  }'
    + '}'
    + ''
    + 'function playBellSound(isTest) {'
    + '  ensureAudio();'
    + '  if (!audioCtx) return;'
    + '  var fire = function() {'
    + '    var reps = isTest ? 1 : parseInt(document.getElementById("repeatMode").value || "2", 10);'
    + '    var now = audioCtx.currentTime + 0.02;'
    + '    for (var r = 0; r < reps; r++) {'
    + '      playSingleChime(now + (r * 0.85));'
    + '    }'
    + '  };'
    + '  if (audioCtx.state === "suspended") {'
    + '    audioCtx.resume().then(fire).catch(function(){});'
    + '  } else {'
    + '    fire();'
    + '  }'
    + '}'
    + ''
    + 'function renderOrders(orders, newIdMap) {'
    + '  var box = document.getElementById("ordersList");'
    + '  while (box.firstChild) box.removeChild(box.firstChild);'
    + '  if (!orders || !orders.length) {'
    + '    var emptyP = document.createElement("p");'
    + '    emptyP.className = "sub";'
    + '    emptyP.textContent = "لا توجد طلبات مسجلة بعد.";'
    + '    box.appendChild(emptyP);'
    + '    return;'
    + '  }'
    + '  for (var i = 0; i < orders.length; i++) {'
    + '    var o = orders[i];'
    + '    var card = document.createElement("div");'
    + '    card.className = newIdMap[o.orderId] ? "order-item order-new" : "order-item";'
    + '    var meta = document.createElement("div");'
    + '    meta.className = "meta";'
    + '    var idSpan = document.createElement("span");'
    + '    idSpan.textContent = (o.orderId || "") + " (صف " + (o.row || "") + ")";'
    + '    var totalSpan = document.createElement("span");'
    + '    totalSpan.textContent = (o.total || 0) + " ج.م";'
    + '    meta.appendChild(idSpan);'
    + '    meta.appendChild(totalSpan);'
    + '    var cust = document.createElement("div");'
    + '    cust.className = "cust";'
    + '    cust.textContent = o.customerName || "";'
    + '    var itemsDiv = document.createElement("div");'
    + '    itemsDiv.textContent = o.items || "";'
    + '    card.appendChild(meta);'
    + '    card.appendChild(cust);'
    + '    card.appendChild(itemsDiv);'
    + '    if (o.notes) {'
    + '      var notesDiv = document.createElement("div");'
    + '      notesDiv.style.color = "#38bdf8";'
    + '      notesDiv.style.fontSize = "11.5px";'
    + '      notesDiv.textContent = "ملاحظة: " + o.notes;'
    + '      card.appendChild(notesDiv);'
    + '    }'
    + '    box.appendChild(card);'
    + '  }'
    + '}'
    + ''
    + 'function pollOrders(forceSheet) {'
    + '  if (!isRunning || inFlight) return;'
    + '  inFlight = true;'
    + '  google.script.run'
    + '    .withSuccessHandler(function(res) {'
    + '      inFlight = false;'
    + '      var nowStr = new Date().toLocaleTimeString("ar-EG");'
    + '      var orders = (res && res.orders) ? res.orders : [];'
    + '      var liveEl = document.getElementById("liveMeta");'
    + '      liveEl.textContent = "آخر فحص: " + nowStr + " — آخر صف: " + ((res && res.lastRow) ? res.lastRow : "-");'
    + '      var newIdMap = {};'
    + '      var hasNew = false;'
    + '      for (var i = 0; i < orders.length; i++) {'
    + '        var id = orders[i].orderId;'
    + '        if (id && !knownIds[id]) {'
    + '          knownIds[id] = true;'
    + '          if (initialized) { hasNew = true; newIdMap[id] = true; }'
    + '        }'
    + '      }'
    + '      initialized = true;'
    + '      renderOrders(orders, newIdMap);'
    + '      if (hasNew) playBellSound(false);'
    + '    })'
    + '    .withFailureHandler(function() {'
    + '      inFlight = false;'
    + '      document.getElementById("liveMeta").textContent = "إعادة محاولة الاتصال...";'
    + '    })'
    + '    .getLatestOrderSignals(Boolean(forceSheet));'
    + '}'
    + ''
    + 'function toggleBell() {'
    + '  ensureAudio();'
    + '  isRunning = !isRunning;'
    + '  var btn = document.getElementById("toggleBtn");'
    + '  var badge = document.getElementById("statusBadge");'
    + '  if (isRunning) {'
    + '    btn.textContent = "⏸️ إيقاف جرس التنبيه";'
    + '    btn.className = "btn btn-stop";'
    + '    badge.textContent = "✅ الجرس يعمل الآن (وضع فائق الخفة)";'
    + '    badge.className = "status status-on";'
    + '    playBellSound(true);'
    + '    pollOrders(true);'
    + '    pollTimer = setInterval(function(){ pollOrders(false); }, 6000);'
    + '  } else {'
    + '    if (pollTimer) clearInterval(pollTimer);'
    + '    inFlight = false;'
    + '    btn.textContent = "🔊 تشغيل جرس التنبيه الآن";'
    + '    btn.className = "btn btn-start";'
    + '    badge.textContent = "⏸️ متوقف — اضغط تشغيل لتفعيل الصوت";'
    + '    badge.className = "status status-off";'
    + '  }'
    + '}'
    + '</script></body></html>';

  var ui = HtmlService.createHtmlOutput(htmlContent)
    .setTitle('🔔 جرس طلبات البوفيه')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(ui);
}
