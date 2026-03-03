class JapaneseCalendar {
    constructor() {
        this.currentDate = new Date();
        this.japaneseColors = [
            '#feeaf5', '#f3c1dc', '#f28cb3', '#d86c9e', '#da4855', '#c02a36', '#900820', '#f2916e',
            '#c08e39', '#c6ac4b', '#f2dc6d', '#f2ee93', '#b8cbb5', '#92a578', '#578c56', '#4c7346',
            '#5ac0b5', '#9cd9d2', '#bde7e5', '#82b8da', '#4c7dc0', '#335aa7', '#175973', '#126c6d',
            '#c9c1d9', '#aca4cb', '#a18aa6', '#926783', '#8c5e85', '#684e8b', '#75888c', '#d0dad2'
        ];

        // Load data from LocalStorage or use defaults
        this.categories = JSON.parse(localStorage.getItem('koyomi_categories')) || [
            { id: 1, name: '仕事', color: '#384d98' },
            { id: 2, name: 'プライベート', color: '#6f7c46' },
            { id: 3, name: '重要', color: '#c94042' }
        ];
        this.events = JSON.parse(localStorage.getItem('koyomi_events')) || [];
        this.migrateData();
        this.fixLegacyDates();

        this.dragState = null; // { eventId, mode: 'start'|'end', originalDate }

        this.initElements();
        this.addEventListeners();
        this.render();

        // Start Intro Animation
        this.playIntroAnimation();
    }

    migrateData() {
        this.events = this.events.map(evt => {
            // 1. Convert old dateKey to ranges
            if (!evt.startDate && evt.dateKey) {
                evt.startDate = evt.dateKey;
                evt.endDate = evt.dateKey;
            }
            // 2. Normalize to Padded YYYY-MM-DD (Month 0-11 -> 00-11 for consistency with current logic, or just ensure padding)
            // Let's rely on formatDate logic.
            evt.startDate = this.normalizeDateStr(evt.startDate);
            evt.endDate = this.normalizeDateStr(evt.endDate);
            return evt;
        });
    }

    // Helper to ensure YYYY-MM-DD padding
    normalizeDateStr(str) {
        if (!str) return '';
        const parts = str.split('-');
        if (parts.length === 3) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        return str;
    }

    initElements() {
        this.prevMonthBtn = document.getElementById('prev-month');
        this.nextMonthBtn = document.getElementById('next-month');
        this.monthDisplay = document.getElementById('current-month-display');
        this.calendarGrid = document.getElementById('calendar-grid');
        this.categoryList = document.getElementById('category-list');
        this.modal = document.getElementById('event-modal');
        this.closeModalBtn = document.querySelector('#event-modal .close-modal');
        this.backModalBtn = document.getElementById('back-event-modal');
        this.eventForm = document.getElementById('event-form');
        this.categorySelect = document.getElementById('event-category-select');

        // Category Modal Elements
        this.catModal = document.getElementById('category-modal');
        this.catForm = document.getElementById('category-form');
        this.addCatBtn = document.getElementById('add-category-btn');
        this.closeCatModalBtn = document.getElementById('close-cat-modal');
        this.catSaveBtn = document.getElementById('save-cat-btn');

        // Day Detail Modal Elements
        this.dayModal = document.getElementById('day-detail-modal');
        this.closeDayModalBtn = document.getElementById('close-day-modal');
        this.dayDetailList = document.getElementById('day-detail-list');
        this.dayDetailAddBtn = document.getElementById('day-detail-add-btn');

        // Multi-day elements
        this.multiDayToggle = document.getElementById('multi-day-toggle');
        this.dateRangeContainer = document.getElementById('date-range-container');
        this.startDateInput = document.getElementById('event-start-date');
        this.endDateInput = document.getElementById('event-end-date');

        // Sync Elements
        this.syncKeyInput = document.getElementById('sync-key');
        this.uploadBtn = document.getElementById('upload-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.syncStatus = document.getElementById('sync-status');
    }

    addEventListeners() {
        this.prevMonthBtn.addEventListener('click', () => this.changeMonth(-1));
        this.nextMonthBtn.addEventListener('click', () => this.changeMonth(1));
        this.closeModalBtn.addEventListener('click', () => this.hideModal());
        this.backModalBtn.addEventListener('click', () => this.handleBackToDayDetail());
        this.eventForm.addEventListener('submit', (e) => this.handleEventSubmit(e));

        // Multi-day toggle handler
        this.multiDayToggle.addEventListener('change', () => {
            if (this.multiDayToggle.checked) {
                this.dateRangeContainer.classList.remove('hidden');
                // Auto-fill if empty
                if (!this.startDateInput.value) this.startDateInput.value = this.selectedDateStr;
                if (!this.endDateInput.value) this.endDateInput.value = this.selectedDateStr;
            } else {
                this.dateRangeContainer.classList.add('hidden');
            }
        });

        // Date picker listeners
        this.startDateInput.addEventListener('click', (e) => this.openMiniCalendar(e, 'start'));
        this.endDateInput.addEventListener('click', (e) => this.openMiniCalendar(e, 'end'));

        // Close mini-calendar on outside click
        document.addEventListener('click', (e) => {
            const picker = document.querySelector('.mini-calendar');
            if (picker && !picker.contains(e.target) &&
                e.target !== this.startDateInput && e.target !== this.endDateInput) {
                picker.remove();
            }
        });

        // Category Events
        this.addCatBtn.addEventListener('click', () => this.openCategoryModal());
        this.closeCatModalBtn.addEventListener('click', () => this.hideCategoryModal());
        this.catForm.addEventListener('submit', (e) => this.handleCategorySubmit(e));

        // Day Modal Events
        this.closeDayModalBtn.addEventListener('click', () => this.hideDayModal());
        this.dayDetailAddBtn.addEventListener('click', () => {
            this.hideDayModal();
            this.openedFromDayModal = true;
            this.openAddEventModal(this.selectedDay, this.selectedDateStr); // Pass dateStr
        });

        // Setup Color Presets
        this.renderColorPresets();

        // Close modal on clicks outside and Esc key
        [this.modal, this.catModal, this.dayModal].forEach(m => {
            m.addEventListener('click', (e) => {
                if (e.target === m) this.closeAllModals();
            });
        });

        // Use global document listener for Esc and Mouse events (dragging)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        document.addEventListener('mousemove', (e) => this.handleDragMove(e));
        document.addEventListener('mouseup', () => this.handleDragEnd());

        // Delete Event Button
        document.getElementById('delete-event-btn').addEventListener('click', () => this.handleDeleteEvent());

        // Sync Event Listeners
        this.uploadBtn.addEventListener('click', () => this.handleUpload());
        this.downloadBtn.addEventListener('click', () => this.handleDownload());
        this.exportBtn.addEventListener('click', () => this.handleExport());
        this.importBtn.addEventListener('click', () => this.handleImport());

        // Load sync key from local storage if exists
        const savedKey = localStorage.getItem('koyomi_sync_key');
        if (savedKey) this.syncKeyInput.value = savedKey;
    }

    closeAllModals() {
        this.hideModal();
        this.hideCategoryModal();
        this.hideDayModal();
    }

    changeMonth(delta) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta);
        this.render();
    }

    render() {
        this.renderHeader();
        this.renderGrid();
        this.renderCategories();
        this.updateCategorySelect();
    }

    renderHeader() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth() + 1;
        this.monthDisplay.textContent = `${year}年 ${month}月`;
    }

    renderGrid() {
        this.calendarGrid.innerHTML = '';

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Monday Start Logic:
        // getDay(): 0(Sun) ... 6(Sat)
        // We want: 0(Mon) ... 6(Sun)
        let headerDay = firstDay.getDay();
        let startDayOfWeek = headerDay === 0 ? 6 : headerDay - 1;

        const totalDays = lastDay.getDate();

        const filledCells = startDayOfWeek + totalDays;
        const neededCells = filledCells > 35 ? 42 : 35;

        // Always maintain 5 rows (35 cells)
        this.calendarGrid.style.gridTemplateRows = 'repeat(5, 1fr)';
        this.currentMaxEvents = 3;

        let startOffset = 0;
        if (neededCells > 35) {
            // For 6-week months, decide whether to show Week 1 or Week 6
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // focusDay: Today if in the current viewing month, otherwise 1st of month
            const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

            // If today is within the first week (first 7 cells), show Row 1-5
            // Otherwise, show Row 2-6 to ensure the end of the month is visible
            if (isCurrentMonth) {
                const todayCellIdx = startDayOfWeek + today.getDate() - 1;
                if (todayCellIdx >= 7) {
                    startOffset = 7;
                }
            } else {
                // If viewing a future/past 6-week month, default to showing the end of the month
                // since navigation usually implies moving forward/backward linearly
                startOffset = 7;
            }
        }

        const remainingCellsValue = (startOffset === 0) ? (35 - filledCells) : (42 - filledCells);
        this.calculateWeeklyLayout(firstDay, startDayOfWeek, totalDays, remainingCellsValue);

        // Rendering loop for exactly 35 cells
        for (let i = 0; i < 35; i++) {
            const cellIdx = i + startOffset;
            const d = new Date(year, month, 1 - startDayOfWeek + cellIdx);
            const dateStr = this.formatDate(d);
            const isOtherMonth = d.getMonth() !== month;
            const dayEl = this.createDayElement(d.getDate(), isOtherMonth, dateStr);
            this.calendarGrid.appendChild(dayEl);
        }

        // Apply Z-Index Stacking (Recalculate after all appended)
        const allDays = this.calendarGrid.querySelectorAll('.calendar-day');
        allDays.forEach((el, index) => {
            el.style.zIndex = 100 - index;
        });
    }

    calculateWeeklyLayout(firstDay, startDayOfWeek, totalDays, remainingCells) {
        this.layoutMap = {}; // Key: 'YYYY-MM-DD', Value: [evt, null, evt, ...]

        // Calculate Grid Start Date
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const gridStart = new Date(year, month, 1);
        gridStart.setDate(gridStart.getDate() - startDayOfWeek);

        // Calculate Total Weeks
        const totalCells = startDayOfWeek + totalDays + remainingCells;
        const weeks = totalCells / 7;

        for (let w = 0; w < weeks; w++) {
            const weekStart = new Date(gridStart);
            weekStart.setDate(weekStart.getDate() + (w * 7));

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            this.processWeek(weekStart, weekEnd);
        }
    }

    processWeek(weekStart, weekEnd) {
        const startStr = this.formatDate(weekStart);
        const endStr = this.formatDate(weekEnd);

        // 1. Filter events overlapping this week
        const weekEvents = this.events.filter(e =>
            e.endDate >= startStr && e.startDate <= endStr
        );

        // 2. Sort: Longest Duration First, then Start Date, then Original Index (for manual reorder)
        weekEvents.sort((a, b) => {
            const durA = (new Date(a.endDate) - new Date(a.startDate));
            const durB = (new Date(b.endDate) - new Date(b.startDate));
            if (durB !== durA) return durB - durA; // Longer first

            if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);

            // Tie-breaker: Original Index in this.events (maintains manual order)
            return this.events.indexOf(a) - this.events.indexOf(b);
        });

        // 3. Assign Slots
        // slotsUsage[dayIndex (0-6)][trackIndex] = true (occupied)
        const slotsUsage = Array(7).fill().map(() => []);

        weekEvents.forEach(evt => {
            // Determine range within this week (0-6)
            let sIdx = 0;
            if (evt.startDate > startStr) {
                const diff = (new Date(evt.startDate) - weekStart) / (1000 * 60 * 60 * 24);
                sIdx = Math.max(0, Math.round(diff));
            }

            let eIdx = 6;
            if (evt.endDate < endStr) {
                const diff = (new Date(evt.endDate) - weekStart) / (1000 * 60 * 60 * 24);
                eIdx = Math.min(6, Math.round(diff));
            }

            // Find first available track
            let track = 0;
            while (true) {
                let available = true;
                for (let d = sIdx; d <= eIdx; d++) {
                    if (slotsUsage[d][track]) {
                        available = false;
                        break;
                    }
                }
                if (available) break;
                track++;
            }

            // Mark usage and Assign to Map
            for (let d = sIdx; d <= eIdx; d++) {
                slotsUsage[d][track] = true;

                const dDate = new Date(weekStart);
                dDate.setDate(dDate.getDate() + d);
                const dStr = this.formatDate(dDate);

                if (!this.layoutMap[dStr]) this.layoutMap[dStr] = [];
                // Fill gaps with null
                while (this.layoutMap[dStr].length < track) {
                    this.layoutMap[dStr].push(null);
                }
                this.layoutMap[dStr][track] = evt;
            }
        });
    }

    createDayElement(dayNum, isOtherMonth, dateStr) {
        const el = document.createElement('div');
        el.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;
        el.dataset.date = dateStr; // Set the date string immediately

        const dateSpan = document.createElement('div');
        dateSpan.className = 'date-badge';

        // Lunar Phase Integration
        const currentDayDate = new Date(dateStr);
        const phaseId = this.getMoonPhaseId(currentDayDate);
        dateSpan.dataset.moonPhase = phaseId;

        // Highlight today
        const today = new Date();
        const todayStr = this.formatDate(today);
        if (dateStr === todayStr) {
            dateSpan.classList.add('today');
        }

        dateSpan.textContent = dayNum;
        el.appendChild(dateSpan);

        // Event listeners for ALL days (including other months)
        // 1. Cell Background Click -> Create New Event
        el.addEventListener('click', (e) => {
            // Only trigger if clicking the cell background directly (or strict children that aren't badges/markers)
            if (e.target === el) {
                this.openAddEventModal(dayNum, dateStr); // Pass full date
            }
        });

        // 2. Date Badge Click -> View Day Details
        dateSpan.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop bubbling to cell
            this.openDayModal(dayNum, dateStr);
        });

        this.renderEventsForDay(el, dayNum);

        return el;
    }

    renderEventsForDay(dayEl, dayNum) {
        // We need the specific date of this cell to check against ranges
        const cellDateStr = dayEl.dataset.date;
        if (!cellDateStr) return; // Should allow legacy render if needed, but we just added dataset.date

        // Use pre-calculated layout found in this.layoutMap
        const slots = (this.layoutMap && this.layoutMap[cellDateStr]) ? this.layoutMap[cellDateStr] : [];

        const maxDisplay = this.currentMaxEvents || 2;
        let hiddenCount = 0;

        // Calculate hidden count (only actual events, not spacers)
        // Check slots starting from maxDisplay
        for (let i = maxDisplay; i < slots.length; i++) {
            if (slots[i]) hiddenCount++;
        }

        // Render visible slots
        // We iterate 0..maxDisplay-1
        for (let i = 0; i < maxDisplay; i++) {
            // If we run out of slots, stop
            if (i >= slots.length) break;

            const evt = slots[i];

            // If it's a spacer (null)
            if (!evt) {
                const spacer = document.createElement('div');
                spacer.className = 'event-marker spacer';
                dayEl.appendChild(spacer);
                continue;
            }

            // Normal Event Rendering logic...
            const cat = this.categories.find(c => c.id == evt.categoryId);
            const marker = document.createElement('div');
            marker.className = 'event-marker';
            marker.dataset.id = evt.id;
            marker.textContent = evt.title;
            marker.style.backgroundColor = cat ? cat.color : '#ccc';

            const cellDate = new Date(cellDateStr);
            const dayOfWeek = cellDate.getDay(); // 0=Sun, 1=Mon...

            // Check Visual Start: Is True Start OR Monday (Start of our week view)
            // Note: Since we use Monday-Start view, Monday(1) is visual start.
            // But if startDayOfWeek logic changes, this hardcoding might be risky. 
            // We know headerDay=1 (from previous steps). 
            // Actually, simplified: If it's Monday(1), it's a visual start for layout purposes.
            // UNLESS the event actually started on Monday, then it's covered by 'cellDateStr === evt.startDate'.

            // Logic: 
            // If it is the very first day of the event -> VISUAL START
            // If it is Monday (and the event started before Monday) -> VISUAL START
            // Otherwise -> PLACEHOLDER

            const isEventStart = (cellDateStr === evt.startDate);
            // Monday is day 1. If today is Monday and Event started < today, it's a visual start.
            const isWeekStart = (dayOfWeek === 1 && cellDateStr > evt.startDate);

            const isVisualStart = isEventStart || isWeekStart;

            if (isVisualStart) {
                marker.classList.add('visual-start');

                // Calculate Span for Width
                // Span is from Here to (Min(EventEnd, WeekEnd))
                // WeekEnd is Sunday (0).
                // Distance to Sunday?
                // Mon(1) -> Sun(0) is 6 days away? 
                // Grid is: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
                // Let's map days to 0-6 index for math.
                // Mon=0, Sun=6.
                const dayIndex = (dayOfWeek + 6) % 7; // Mon=0 .. Sun=6

                // Effective end of this row is Sunday (Index 6)
                // How many days left in this week? (7 - dayIndex)
                const daysLeftInWeek = 7 - dayIndex;

                // How many days left in event?
                const evtEnd = new Date(evt.endDate);
                const diffTime = evtEnd - cellDate;
                const daysLeftInEvent = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                const span = Math.min(daysLeftInEvent, daysLeftInWeek);

                // Apply Width
                // Padding is 4px * 2 = 8px. Gap is 1px. Total extra distance per span is 9px.
                // Formula: (Width + Padding + Gap) * (span - 1) + Width
                // = (100% + 9px) * (span - 1) + 100%
                // = 100% * span + 9px * span - 9px
                marker.style.width = `calc((100% + 9px) * ${span} - 9px)`;

                // Text clipping handling: 
                // "If multi-day event starts on Sunday(0), truncate as before"
                // My map: Sun is index 6. 
                // If dayIndex == 6 (Sunday) and span is 1 (obviously), standard behavior.
                // Since span=1, width=100%, overflow logic handles itself naturally?
                // But we set overflow:visible on visual-start.
                // If it is Sunday (end of row), overflow:visible might spill to next row/container.
                // We should enforce overflow:hidden if it's the last col.
                if (dayIndex === 6) {
                    marker.style.overflow = 'hidden';
                }

                // Handles
                // If this visual segment contains the True Start, add Left Handle
                if (isEventStart) {
                    const handleL = document.createElement('div');
                    handleL.className = 'resize-handle handle-left';
                    handleL.addEventListener('mousedown', (e) => this.startDrag(e, evt, 'start'));
                    marker.appendChild(handleL);
                }

                // If this visual segment contains the True End, add Right Handle
                // It contains true end if (cellDate + span - 1) == evtEnd
                // Or simplified: span == daysLeftInEvent
                if (span === daysLeftInEvent) {
                    const handleR = document.createElement('div');
                    handleR.className = 'resize-handle handle-right';
                    handleR.addEventListener('mousedown', (e) => this.startDrag(e, evt, 'end'));
                    marker.appendChild(handleR);

                    // Fix Visuals: If it ends here, it should have rounded right corners
                    marker.classList.remove('event-continues-right');
                    marker.style.borderTopRightRadius = ''; // Reset CSS override if any
                    marker.style.borderBottomRightRadius = '';
                } else {
                    // It doesn't end here (split by week), so ensure flat right
                    marker.classList.add('event-continues-right');
                }

            } else {
                marker.classList.add('placeholder');
            }

            // Drag support (Move) - Applied to all (even placeholders need to capture events? No, visual start covers them)
            // Actually, visual start covers the space. The placeholder is underneath.
            // But we add listener to 'marker'.
            // The 'marker' we append to DOM:
            // If it's visual start -> It covers functionality.
            // If it's placeholder -> It is hidden.
            marker.addEventListener('mousedown', (e) => {
                if (!e.target.classList.contains('resize-handle')) {
                    // Start drag from the *Visual Start Date* (which is this cellDateStr for the big bar)
                    // If we dragged the 'Tuesday' part of a 'Monday' bar, the click is on Monday Bar.
                    // initialDragDate passed to startDrag will be Monday (cellDateStr).
                    // This is correct.
                    this.startDrag(e, evt, 'move', cellDateStr);
                }
            });

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.justDragged) {
                    this.justDragged = false;
                    return;
                }
                this.openEditEventModal(evt);
            });

            dayEl.appendChild(marker);
        }

        // Add "More" indicator if needed
        if (hiddenCount > 0) {
            const moreEl = document.createElement('div');
            moreEl.className = 'more-events-indicator';
            moreEl.textContent = `他${hiddenCount}件`;
            moreEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDayModal(dayNum, cellDateStr);
            });
            dayEl.appendChild(moreEl);
        }
    }

    startDrag(e, evt, mode, initialDateStr = null) {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection

        this.dragState = {
            eventId: evt.id,
            mode: mode,
            startX: e.clientX,
            startY: e.clientY,
            isDragging: false,
            // For move mode
            initialDragDate: initialDateStr,
            lastHoveredDate: initialDateStr, // Initialize for same-cell reorder check
            initialStartDate: evt.startDate,
            initialEndDate: evt.endDate
        };
    }

    handleDragMove(e) {
        if (!this.dragState) return;

        // Check if moved enough to consider it a drag
        if (!this.dragState.isDragging) {
            const dx = e.clientX - this.dragState.startX;
            const dy = e.clientY - this.dragState.startY;
            if (dx * dx + dy * dy > 25) { // 5px threshold
                this.dragState.isDragging = true;
                // Add a class to the marker for DOM-based reordering logic
                const marker = document.querySelector(`.event-marker[data-id="${this.dragState.eventId}"].visual-start`);
                if (marker) {
                    marker.classList.add('dragging-main');
                    marker.setAttribute('draggable', 'true'); // Temporarily allow native drag-over integration if needed, but we use our move logic
                }
            } else {
                return; // Haven't moved enough yet
            }
        }

        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) return;

        const dayEl = el.closest('.calendar-day');

        if (dayEl && dayEl.dataset.date) {
            const newDate = dayEl.dataset.date;

            const evtIdx = this.events.findIndex(ev => ev.id === this.dragState.eventId);
            if (evtIdx === -1) return;

            const evt = this.events[evtIdx];
            let changed = false;

            if (this.dragState.mode === 'end') {
                if (newDate >= evt.startDate && newDate !== evt.endDate) {
                    this.events[evtIdx].endDate = newDate;
                    changed = true;
                }
            } else if (this.dragState.mode === 'start') {
                if (newDate <= evt.endDate && newDate !== evt.startDate) {
                    this.events[evtIdx].startDate = newDate;
                    changed = true;
                }
            } else if (this.dragState.mode === 'move') {
                if (newDate === this.dragState.initialStartDate) {
                    // --- Reordering within the same cell ---
                    const draggable = document.querySelector('.event-marker.dragging-main');
                    if (draggable) {
                        const afterElement = this.getDragAfterElement(dayEl, e.clientY, '.event-marker:not(.placeholder)');
                        // Optimization: Check if position changed before moving DOM
                        if (afterElement !== draggable) {
                            if (afterElement == null) {
                                dayEl.appendChild(draggable);
                            } else {
                                dayEl.insertBefore(draggable, afterElement);
                            }
                        }
                    }
                } else if (this.dragState.initialDragDate && newDate !== this.dragState.lastHoveredDate) {
                    // --- Moving between cells ---
                    const d1 = new Date(this.dragState.initialDragDate);
                    const d2 = new Date(newDate);
                    const diffTime = d2 - d1;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    const newStart = this.addDays(this.dragState.initialStartDate, diffDays);
                    const newEnd = this.addDays(this.dragState.initialEndDate, diffDays);

                    if (evt.startDate !== newStart || evt.endDate !== newEnd) {
                        this.events[evtIdx].startDate = newStart;
                        this.events[evtIdx].endDate = newEnd;
                        changed = true;
                        this.dragState.lastHoveredDate = newDate;
                    }
                }
            }

            if (changed) {
                this.renderGrid();
                // After render, we need to re-apply the dragging class to the new marker
                const newMarker = document.querySelector(`.event-marker[data-id="${this.dragState.eventId}"].visual-start`);
                if (newMarker) newMarker.classList.add('dragging-main');
            }
        }
    }

    addDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return this.formatDate(d);
    }

    handleDragEnd() {
        if (this.dragState) {
            const marker = document.querySelector('.event-marker.dragging-main');

            if (this.dragState.isDragging) {
                // If it was a "move" drag AND it ended on the same start date, trigger reorder persistence
                if (this.dragState.mode === 'move' && this.dragState.lastHoveredDate === this.dragState.initialStartDate) {
                    this.handleDirectReorder(this.dragState.eventId, this.dragState.initialStartDate);
                } else {
                    this.saveData(); // Commit date moves
                    this.renderGrid();
                }

                this.justDragged = true;
                // Clear flag after a short timeout so click handler sees it
                setTimeout(() => { this.justDragged = false; }, 100);
            }

            if (marker) {
                marker.classList.remove('dragging-main');
            }

            this.dragState = null;
        }
    }

    handleDirectReorder(eventId, dateStr) {
        const cell = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (!cell) return;

        const markers = [...cell.querySelectorAll('.event-marker:not(.placeholder)')];
        const visibleIds = markers.map(m => m.dataset.id);

        // All events occurring on this day
        const dayEvents = this.events.filter(evt => dateStr >= evt.startDate && dateStr <= evt.endDate);

        // Split dayEvents into those visible in DOM and those not
        const visibleEvents = visibleIds.map(id => dayEvents.find(evt => evt.id == id)).filter(Boolean);
        const hiddenEvents = dayEvents.filter(evt => !visibleIds.includes(String(evt.id)));

        // Combine: Visible ones in their new order, then hidden ones at the bottom
        const sortedDayEvents = [...visibleEvents, ...hiddenEvents];

        // Update the global events array
        const otherEvents = this.events.filter(evt => !(dateStr >= evt.startDate && dateStr <= evt.endDate));

        // We want to insert sortedDayEvents where the first dayEvent used to be to preserve general relative order
        const firstIdx = this.events.findIndex(evt => dateStr >= evt.startDate && dateStr <= evt.endDate);

        let newEventsArray = [...this.events];
        if (firstIdx !== -1) {
            newEventsArray = [
                ...this.events.slice(0, firstIdx).filter(evt => !(dateStr >= evt.startDate && dateStr <= evt.endDate)),
                ...sortedDayEvents,
                ...this.events.slice(firstIdx + 1).filter(evt => !(dateStr >= evt.startDate && dateStr <= evt.endDate))
            ];
        }

        this.events = newEventsArray;
        this.saveData();
        this.renderGrid();
    }

    formatDate(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Calculates the Moon Age (0 to 29.5) for a given date.
     * Based on the synodic period of 29.530588853 days.
     * Uses a known New Moon epoch for precision.
     */
    getMoonAge(date) {
        // Known New Moon (Epoch): Jan 6, 2000, 18:14 UTC
        const epoch = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
        const synodicMonth = 29.530588853;

        // Difference in days
        const diffMs = date.getTime() - epoch.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        // Moon age in the current cycle
        let age = diffDays % synodicMonth;
        if (age < 0) age += synodicMonth;

        return age;
    }

    /**
     * Returns a phase ID (0-7) for CSS styling
     * 0: New Moon, 1-2: Waxing, 4: Full, 5-7: Waning
     */
    getMoonPhaseId(date) {
        const age = this.getMoonAge(date);

        // Divide into 8 distinct visual phases for CSS
        // 0: New, 1: Waxing Crescent, 2: First Quarter, 3: Waxing Gibbous
        // 4: Full, 5: Waning Gibbous, 6: Last Quarter, 7: Waning Crescent
        return Math.floor((age + 1.845) / 3.691) % 8;
    }

    // Fix for 0-indexed months in legacy data
    fixLegacyDates() {
        let changed = false;
        // Check if any event has invalid month '00' (January in old broken format)
        // If we find 00, we assume the whole dataset is 0-indexed and needs shifting +1
        const hasZeroMonth = this.events.some(e => {
            return (e.startDate && e.startDate.split('-')[1] === '00') ||
                (e.endDate && e.endDate.split('-')[1] === '00');
        });

        if (hasZeroMonth) {
            console.log("Detected 0-indexed dates, migrating...");
            this.events = this.events.map(evt => {
                evt.startDate = this.shiftMonth(evt.startDate);
                evt.endDate = this.shiftMonth(evt.endDate);
                return evt;
            });
            changed = true;
        }

        if (changed) {
            this.saveData();
        }
    }

    shiftMonth(dateStr) {
        if (!dateStr) return dateStr;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const y = parts[0];
            let m = parseInt(parts[1], 10);
            const d = parts[2];
            m = m + 1; // Shift 0-11 to 1-12
            return `${y}-${String(m).padStart(2, '0')}-${d}`;
        }
        return dateStr;
    }

    renderCategories() {
        this.categoryList.innerHTML = '';
        this.categories.forEach(cat => {
            const li = document.createElement('li');
            li.className = 'category-item';

            li.innerHTML = `
                <div class="category-content-clickable" title="編集">
                    <span class="color-dot" style="background-color: ${cat.color}"></span>
                    <span class="category-name">${cat.name}</span>
                </div>
                <button class="delete-btn" title="削除">×</button>
            `;

            // Edit trigger
            li.querySelector('.category-content-clickable').addEventListener('click', () => {
                this.openCategoryModal(cat); // Pass existing cat for edit
            });

            // Delete trigger
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteCategory(cat.id);
            });

            // Drag & Drop Attributes
            li.setAttribute('draggable', 'true');
            li.dataset.id = cat.id;

            // Drag Events
            li.addEventListener('dragstart', (e) => this.handleCatDragStart(e, li));
            // Dragover needs to be on the container efficiently, but item listener works for simple lists
            // Actually, for live sort, it is better to listen on the list container for dragover
            li.addEventListener('dragend', (e) => this.handleCatDragEnd(e, li));

            this.categoryList.appendChild(li);
        });

        // Add container listener for live sort
        this.categoryList.addEventListener('dragover', (e) => this.handleCatListDragOver(e));
    }

    // --- Category Drag & Drop Handlers (Live Sort) ---

    handleCatDragStart(e, item) {
        this.draggedCatItem = item;
        e.dataTransfer.effectAllowed = 'move';
        // Delay adding class so the ghost image is taken from full opacity element
        setTimeout(() => item.classList.add('dragging'), 0);
    }

    handleCatListDragOver(e) {
        e.preventDefault();
        const afterElement = this.getDragAfterElement(this.categoryList, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (!draggable) return;

        if (afterElement == null) {
            this.categoryList.appendChild(draggable);
        } else {
            this.categoryList.insertBefore(draggable, afterElement);
        }
    }

    getDragAfterElement(container, y, selector = '.category-item') {
        const draggableElements = [...container.querySelectorAll(`${selector}:not(.dragging)`)];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    handleCatDragEnd(e, item) {
        item.classList.remove('dragging');
        this.draggedCatItem = null;

        // Sync Data with DOM order
        this.syncCategoriesFromDOM();
    }

    syncCategoriesFromDOM() {
        const newOrder = [];
        this.categoryList.querySelectorAll('.category-item').forEach(li => {
            const id = li.dataset.id;
            const cat = this.categories.find(c => c.id == id);
            if (cat) newOrder.push(cat);
        });

        // Only update if changed
        if (JSON.stringify(newOrder) !== JSON.stringify(this.categories)) {
            this.categories = newOrder;
            this.saveData();
            // No need to render categories again as DOM is already correct
            this.updateCategorySelect();
            this.renderGrid();
        }
    }

    updateCategorySelect() {
        this.categorySelect.innerHTML = '';
        this.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            this.categorySelect.appendChild(option);
        });
    }

    openMiniCalendar(e, type) {
        e.stopPropagation();
        const existing = document.querySelector('.mini-calendar');
        if (existing) existing.remove();

        const rect = e.target.getBoundingClientRect();
        const picker = document.createElement('div');
        picker.className = 'mini-calendar';
        picker.style.top = `${rect.bottom + window.scrollY + 5}px`;
        picker.style.left = `${rect.left + window.scrollX}px`;

        // Use the current value or selectedDateStr as baseline
        const baseDate = new Date(e.target.value || this.selectedDateStr);
        this.renderMiniCalendar(picker, baseDate.getFullYear(), baseDate.getMonth(), type);
        document.body.appendChild(picker);
    }

    renderMiniCalendar(container, year, month, type) {
        container.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'mini-calendar-header';

        const prev = document.createElement('button');
        prev.innerHTML = '〈';
        prev.type = 'button';
        prev.onclick = (e) => { e.stopPropagation(); this.renderMiniCalendar(container, year, month - 1, type); };

        const title = document.createElement('span');
        title.textContent = `${year}年 ${month + 1}月`;

        const next = document.createElement('button');
        next.innerHTML = '〉';
        next.type = 'button';
        next.onclick = (e) => { e.stopPropagation(); this.renderMiniCalendar(container, year, month + 1, type); };

        header.append(prev, title, next);
        container.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'mini-calendar-grid';

        const days = ['月', '火', '水', '木', '金', '土', '日'];
        days.forEach(d => {
            const h = document.createElement('div');
            h.className = 'mini-day-header';
            h.textContent = d;
            grid.appendChild(h);
        });

        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        let startDay = first.getDay() || 7; // 1 (Mon) to 7 (Sun)

        // Fill empty
        for (let i = 1; i < startDay; i++) {
            const empty = document.createElement('div');
            grid.appendChild(empty);
        }

        const targetInput = type === 'start' ? this.startDateInput : this.endDateInput;

        for (let d = 1; d <= last.getDate(); d++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'mini-day';
            dayEl.textContent = d;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (dateStr === targetInput.value) dayEl.classList.add('selected');

            dayEl.onclick = (e) => {
                e.stopPropagation();
                targetInput.value = dateStr;
                container.remove();

                // Logic check: if start > end, set end = start
                if (type === 'start' && this.endDateInput.value < dateStr) {
                    this.endDateInput.value = dateStr;
                }
                // if end < start, set start = end
                if (type === 'end' && this.startDateInput.value > dateStr) {
                    this.startDateInput.value = dateStr;
                }
            };
            grid.appendChild(dayEl);
        }
        container.appendChild(grid);
    }

    openAddEventModal(dayNum, dateStr) {
        // Use passed dateStr (already padded)
        this.selectedDateStr = dateStr;

        // Extract parts for title
        const parts = dateStr.split('-');
        const y = parts[0];
        const m = parseInt(parts[1]); // Month is already 1-indexed from dateStr
        const d = parseInt(parts[2]);

        document.getElementById('modal-date-title').textContent = `${y}年${m}月${d}日の予定作成`;

        // Reset form
        document.getElementById('event-edit-id').value = '';
        document.getElementById('event-title').value = '';
        document.getElementById('event-desc').value = '';

        // Default Multi-day off
        this.multiDayToggle.checked = false;
        this.dateRangeContainer.classList.add('hidden');
        this.startDateInput.value = dateStr;
        this.endDateInput.value = dateStr;

        if (this.categories.length > 0) this.categorySelect.value = this.categories[0].id; // Default category

        if (this.openedFromDayModal) {
            this.backModalBtn.classList.remove('hidden');
        } else {
            this.backModalBtn.classList.add('hidden');
        }

        document.getElementById('delete-event-btn').classList.add('hidden'); // Hide delete btn
        this.modal.classList.remove('hidden');
        // Delay focus to allow display transition
        setTimeout(() => {
            document.getElementById('event-title').focus();
        }, 50);
    }

    openEditEventModal(evt) {
        document.getElementById('event-edit-id').value = evt.id;
        document.getElementById('event-title').value = evt.title;
        document.getElementById('event-desc').value = evt.description;
        document.getElementById('event-category-select').value = evt.categoryId;

        // Parsing logic updated
        this.selectedDateStr = evt.startDate;
        this.startDateInput.value = evt.startDate;
        this.endDateInput.value = evt.endDate;

        // If range > 1 day, enable toggle
        const isMulti = evt.startDate !== evt.endDate;
        this.multiDayToggle.checked = isMulti;
        if (isMulti) {
            this.dateRangeContainer.classList.remove('hidden');
        } else {
            this.dateRangeContainer.classList.add('hidden');
        }

        if (this.openedFromDayModal) {
            this.backModalBtn.classList.remove('hidden');
        } else {
            this.backModalBtn.classList.add('hidden');
        }

        document.getElementById('modal-date-title').textContent = `予定を編集`;
        document.getElementById('delete-event-btn').classList.remove('hidden'); // Show delete btn
        this.modal.classList.remove('hidden');
        // Delay focus to allow display transition
        setTimeout(() => {
            document.getElementById('event-title').focus();
        }, 50);
    }

    handleDeleteEvent() {
        const id = document.getElementById('event-edit-id').value;
        if (id && confirm('この予定を削除しますか？')) {
            this.events = this.events.filter(e => e.id != id);
            this.saveData();
            this.renderGrid();
            this.hideModal();
        }
    }

    hideModal() {
        this.modal.classList.add('hidden');
        this.eventForm.reset();
        document.getElementById('event-edit-id').value = '';
        this.openedFromDayModal = false; // Reset flag
    }

    handleBackToDayDetail() {
        this.hideModal();
        this.openDayModal(this.selectedDay, this.selectedDateStr);
    }

    handleEventSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('event-edit-id').value;
        const title = document.getElementById('event-title').value;
        const catId = document.getElementById('event-category-select').value;
        const desc = document.getElementById('event-desc').value;

        const isMulti = this.multiDayToggle.checked;
        const startDate = isMulti ? this.startDateInput.value : this.selectedDateStr;
        const endDate = isMulti ? this.endDateInput.value : this.selectedDateStr;

        if (id) {
            // Update existing
            const index = this.events.findIndex(evt => evt.id == id);
            if (index !== -1) {
                this.events[index] = {
                    ...this.events[index],
                    title,
                    categoryId: catId,
                    description: desc,
                    startDate,
                    endDate
                };
            }
        } else {
            // Create new
            const newEvent = {
                id: Date.now(),
                startDate,
                endDate,
                title,
                categoryId: catId,
                description: desc
            };
            this.events.push(newEvent);
        }

        this.saveData();
        this.renderGrid();
        this.hideModal();
    }

    // --- Category Management ---

    renderColorPresets() {
        const container = document.getElementById('color-presets');
        container.innerHTML = '';
        this.japaneseColors.forEach(color => {
            const div = document.createElement('div');
            div.className = 'color-preset';
            div.style.backgroundColor = color;
            div.addEventListener('click', () => this.selectColor(color, div));
            container.appendChild(div);
        });
    }

    selectColor(color, element) {
        document.getElementById('cat-color').value = color; // Hidden input

        // Visual selection
        document.querySelectorAll('.color-preset').forEach(el => el.classList.remove('selected'));
        if (element) {
            element.classList.add('selected');
        } else {
            // Find element matching color if passed programmatically
            const match = Array.from(document.querySelectorAll('.color-preset')).find(el =>
                this.rgbToHex(el.style.backgroundColor) === color || el.style.backgroundColor === color
            );
            if (match) match.classList.add('selected');
        }
    }

    // Helper for color matching if needed (simplified)
    rgbToHex(col) {
        if (col.charAt(0) == '#') return col;
        // ... (assume hex in this simple app for now)
        return col;
    }

    openCategoryModal(category = null) {
        this.catModal.classList.remove('hidden');
        const titleEl = document.getElementById('cat-modal-title');

        if (category) {
            titleEl.textContent = '区分を編集';
            document.getElementById('cat-edit-id').value = category.id;
            document.getElementById('cat-name').value = category.name;
            this.selectColor(category.color);
        } else {
            titleEl.textContent = '区分を作成';
            document.getElementById('cat-edit-id').value = '';
            document.getElementById('cat-name').value = '';
            this.selectColor(this.japaneseColors[0]); // Default
        }

        // Auto-focus input
        setTimeout(() => {
            document.getElementById('cat-name').focus();
        }, 50);
    }

    hideCategoryModal() {
        this.catModal.classList.add('hidden');
        this.catForm.reset();
        document.getElementById('cat-edit-id').value = '';
    }

    handleCategorySubmit(e) {
        e.preventDefault();
        const id = document.getElementById('cat-edit-id').value;
        const name = document.getElementById('cat-name').value;
        const color = document.getElementById('cat-color').value;

        if (id) {
            // Update existing
            const index = this.categories.findIndex(c => c.id == id);
            if (index !== -1) {
                this.categories[index] = { ...this.categories[index], name, color };
            }
        } else {
            // Create new
            const newCat = {
                id: Date.now(),
                name,
                color
            };
            this.categories.push(newCat);
        }

        this.saveData();
        this.renderCategories();
        this.updateCategorySelect();
        this.renderGrid(); // Re-render grid to update event colors
        this.hideCategoryModal();
    }

    // --- Day Detail Modal ---

    openDayModal(dayNum, dateStr) {
        // Use passed dateStr (or reconstruct if needed, but passing is safer)
        if (!dateStr) {
            // Fallback for click logic if needed
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth();
            dateStr = this.normalizeDateStr(`${year}-${month}-${dayNum}`);
        }

        this.selectedDay = dayNum; // Keep for dayDetailAddBtn
        this.selectedDateStr = dateStr; // Store for dayDetailAddBtn

        const parts = dateStr.split('-');
        const y = parts[0];
        const m = parseInt(parts[1]); // Fixed: dateStr already has 1-indexed month
        const d = parseInt(parts[2]);

        document.getElementById('day-detail-title').textContent = `${y}年${m}月${d}日`;

        this.renderDayDetailList(dayNum, dateStr);
        this.dayModal.classList.remove('hidden');
    }

    hideDayModal() {
        this.dayModal.classList.add('hidden');
    }

    renderDayDetailList(dayNum, dateStr) {
        this.dayDetailList.innerHTML = '';
        // Filter using range
        const events = this.events.filter(e =>
            dateStr >= e.startDate && dateStr <= e.endDate
        );


        if (events.length === 0) {
            this.dayDetailList.innerHTML = '<p style="text-align:center; color:#888;">予定はありません</p>';
            return;
        }

        events.forEach(evt => {
            const cat = this.categories.find(c => c.id == evt.categoryId);
            const color = cat ? cat.color : '#ccc';
            const catName = cat ? cat.name : '未分類';

            const item = document.createElement('div');
            item.className = 'detail-item';
            item.setAttribute('draggable', 'true');
            item.dataset.id = evt.id;
            item.style.borderLeftColor = color;
            item.innerHTML = `
                <div class="detail-content">
                    <strong>${evt.title}</strong>
                    <span>${catName}</span>
                </div>
                <div class="detail-actions">
                    <button class="btn-sm btn-delete">削除</button>
                </div>
            `;

            // Drag Events for Events
            item.addEventListener('dragstart', (e) => {
                this.isDraggingInModal = true;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
                this.syncEventsFromDOM(dateStr);
                // Clear drag flag after a short delay so click listener can ignore it
                setTimeout(() => { this.isDraggingInModal = false; }, 100);
            });

            // Click entire item to edit
            item.addEventListener('click', (e) => {
                if (this.isDraggingInModal) return;
                this.hideDayModal();
                this.openedFromDayModal = true;
                this.openEditEventModal(evt);
            });

            // Delete event action
            item.querySelector('.btn-delete').addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger the item's edit click
                if (confirm('この予定を削除しますか？')) {
                    this.events = this.events.filter(e => e.id !== evt.id);
                    this.saveData();
                    this.renderGrid(); // Update calendar
                    this.renderDayDetailList(dayNum, dateStr); // Update list
                }
            });

            this.dayDetailList.appendChild(item);
        });

        // Container listener for live sort
        this.dayDetailList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(this.dayDetailList, e.clientY, '.detail-item');
            const draggable = this.dayDetailList.querySelector('.dragging');
            if (!draggable) return;

            if (afterElement == null) {
                this.dayDetailList.appendChild(draggable);
            } else {
                this.dayDetailList.insertBefore(draggable, afterElement);
            }
        });
    }

    syncEventsFromDOM(dateStr) {
        const domOrderIds = [...this.dayDetailList.querySelectorAll('.detail-item')].map(el => el.dataset.id);
        const dayEvents = this.events.filter(evt => dateStr >= evt.startDate && dateStr <= evt.endDate);
        const sortedDayEvents = domOrderIds.map(id => dayEvents.find(evt => evt.id == id)).filter(Boolean);

        let newEventsArray = [];
        let replaced = false;

        this.events.forEach(evt => {
            const isOnThisDay = (dateStr >= evt.startDate && dateStr <= evt.endDate);
            if (!isOnThisDay) {
                newEventsArray.push(evt);
            } else if (!replaced) {
                newEventsArray.push(...sortedDayEvents);
                replaced = true;
            }
        });

        this.events = newEventsArray;
        this.saveData();
        this.renderGrid();
    }

    deleteCategory(id) {
        if (confirm('この区分を削除しますか？')) {
            this.categories = this.categories.filter(c => c.id !== id);
            this.saveData();
            this.renderCategories();
            this.updateCategorySelect();
        }
    }

    // --- Storage ---
    saveData() {
        localStorage.setItem('koyomi_categories', JSON.stringify(this.categories));
        localStorage.setItem('koyomi_events', JSON.stringify(this.events));
    }

    // --- Intro Animation: Triple Shoji Reveal ---
    playIntroAnimation() {
        const overlay = document.getElementById('intro-overlay');
        const gardenBg = document.getElementById('intro-garden-bg');
        if (!overlay || !gardenBg) return;

        // Step 1: Initial Open - Reveal the night garden
        setTimeout(() => {
            overlay.classList.add('intro-open');

            // Step 2: Stay open for 2 seconds to enjoy the view
            setTimeout(() => {

                // Step 3: Close the Shoji doors
                overlay.classList.remove('intro-open');

                // Step 4: While doors are closed (after 1.2s animation), prepare the reveal
                setTimeout(() => {
                    gardenBg.classList.add('hidden'); // Hide garden
                    overlay.style.backgroundColor = 'transparent'; // Make overlay transparent to show app behind it

                    // Step 5: Final Reveal - Open the doors to show the calendar
                    setTimeout(() => {
                        overlay.classList.add('intro-open');

                        // Step 6: Fade out the entire overlay
                        setTimeout(() => {
                            overlay.classList.add('fade-out');
                            setTimeout(() => {
                                overlay.style.display = 'none';
                            }, 1000); // Wait for fade-out to finish
                        }, 1500); // Pause after total reveal

                    }, 1000); // Wait 1s with doors closed before final opening

                }, 1200); // Wait for shoji-close animation (1.2s) before preparing reveal

            }, 2000); // Initial view duration
        }, 1000); // Initial delay
    }

    // --- Cloud Synchronization ---

    updateSyncStatus(msg, type = '') {
        this.syncStatus.textContent = msg + (msg === '未同期' ? '' : ' (v1.2)');
        this.syncStatus.className = `sync-status ${type}`;
    }

    // Generate a unique token from the secret key for secure storage
    async getSyncToken(key) {
        const msgBuffer = new TextEncoder().encode(key + "_koyomi_v2_salt");
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        // Use a 32-char hex string as the storage ID
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    }

    async handleUpload() {
        const key = this.syncKeyInput.value.trim();
        if (!key) {
            alert('同期キーを入力してください。');
            return;
        }

        this.updateSyncStatus('保存中...');
        localStorage.setItem('koyomi_sync_key', key);

        try {
            const token = await this.getSyncToken(key);
            const data = {
                categories: this.categories,
                events: this.events,
                updatedAt: new Date().toISOString()
            };

            // Using npoint.io: A very reliable and simple JSON bin service
            const response = await fetch(`https://api.npoint.io/${token.substring(0, 20)}`, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                this.updateSyncStatus('保存完了', 'success');
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('Upload Error:', error);
            this.updateSyncStatus('保存失敗', 'error');
            alert(`ネットワーク保存に失敗しました。下の「ファイルへ保存」ボタンを使えば、確実にバックアップをとることができます。`);
        }
    }

    async handleDownload() {
        const key = this.syncKeyInput.value.trim();
        if (!key) {
            alert('同期キーを入力してください。');
            return;
        }

        if (!confirm('クラウドのデータで現在の予定を上書きしますか？')) return;

        this.updateSyncStatus('読み込み中...');
        localStorage.setItem('koyomi_sync_key', key);

        try {
            const token = await this.getSyncToken(key);
            const response = await fetch(`https://api.npoint.io/${token.substring(0, 20)}`);

            if (response.status === 404) {
                this.updateSyncStatus('未保存', 'error');
                alert('まだデータが保存されていないか、キーが間違っています。');
                return;
            }

            if (response.ok) {
                const data = await response.json();
                if (data && data.categories && data.events) {
                    this.categories = data.categories;
                    this.events = data.events;
                    this.saveData();
                    this.render();
                    this.updateSyncStatus('同期完了', 'success');
                } else {
                    throw new Error('Invalid format');
                }
            } else {
                throw new Error('Network error');
            }
        } catch (error) {
            console.error('Download Error:', error);
            this.updateSyncStatus('同期失敗', 'error');
            alert(`データの取得に失敗しました。キーが正しいか確認するか、保存済みファイルの読み込みをお試しください。`);
        }
    }

    // --- File Backup Strategy (100% Guaranteed) ---
    handleExport() {
        const data = {
            categories: this.categories,
            events: this.events,
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `koyomi_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.updateSyncStatus('書き出し完了', 'success');
    }

    handleImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data && data.categories && data.events) {
                        this.categories = data.categories;
                        this.events = data.events;
                        this.saveData();
                        this.render();
                        this.updateSyncStatus('読み込み完了', 'success');
                        alert('データを読み込みました。');
                    } else {
                        alert('ファイル形式が正しくありません。');
                    }
                } catch (err) {
                    alert('ファイルの読み込みに失敗しました。');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new JapaneseCalendar();
});
