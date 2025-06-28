let autoRefreshIntervalId = null;
const zoomMin = 2 * 1000 * 60 * 60 * 24 // 2 day in milliseconds
const zoomMax = 4 * 7 * 1000 * 60 * 60 * 24 // 4 weeks in milliseconds

// Enhanced color palette for better visual appeal
const UNAVAILABLE_COLOR = '#E8B4B8' // Soft red
const UNDESIRED_COLOR = '#F4D1AE' // Soft orange
const DESIRED_COLOR = '#A8D5BA' // Soft green
const NORMAL_COLOR = '#D4A5A5' // Soft pink
const OVERLAP_COLOR = '#E8B4B8' // Soft red for overlaps

let demoDataId = null;
let scheduleId = null;
let loadedSchedule = null;

const byEmployeePanel = document.getElementById("byEmployeePanel");
const byEmployeeTimelineOptions = {
    timeAxis: {scale: "hour", step: 6},
    orientation: {axis: "top"},
    stack: false,
    xss: {disabled: true}, // Items are XSS safe through JQuery
    zoomMin: zoomMin,
    zoomMax: zoomMax,
    height: '600px',
    margin: {
        item: 10,
        axis: 5
    }
};
let byEmployeeGroupDataSet = new vis.DataSet();
let byEmployeeItemDataSet = new vis.DataSet();
let byEmployeeTimeline = new vis.Timeline(byEmployeePanel, byEmployeeItemDataSet, byEmployeeGroupDataSet, byEmployeeTimelineOptions);

const byLocationPanel = document.getElementById("byLocationPanel");
const byLocationTimelineOptions = {
    timeAxis: {scale: "hour", step: 6},
    orientation: {axis: "top"},
    xss: {disabled: true}, // Items are XSS safe through JQuery
    zoomMin: zoomMin,
    zoomMax: zoomMax,
    height: '600px',
    margin: {
        item: 10,
        axis: 5
    }
};
let byLocationGroupDataSet = new vis.DataSet();
let byLocationItemDataSet = new vis.DataSet();
let byLocationTimeline = new vis.Timeline(byLocationPanel, byLocationItemDataSet, byLocationGroupDataSet, byLocationTimelineOptions);

let windowStart = JSJoda.LocalDate.now().toString();
let windowEnd = JSJoda.LocalDate.parse(windowStart).plusDays(7).toString();

$(document).ready(function () {
    replaceQuickstartSukanyaGhoshAutoHeaderFooter();

    $("#solveButton").click(function () {
        solve();
    });
    $("#stopSolvingButton").click(function () {
        stopSolving();
    });
    $("#analyzeButton").click(function () {
        analyze();
    });
    // HACK to allow vis-timeline to work within Bootstrap tabs
    $("#byEmployeeTab").on('shown.bs.tab', function (event) {
        byEmployeeTimeline.redraw();
    })
    $("#byLocationTab").on('shown.bs.tab', function (event) {
        byLocationTimeline.redraw();
    })

    setupAjax();
    fetchDemoData();
    
    // Add smooth scrolling and enhanced interactions
    $('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        $('html, body').animate({
            scrollTop: $('.tab-content').offset().top - 100
        }, 500);
    });
});

function setupAjax() {
    $.ajaxSetup({
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json,text/plain', // plain text is required by solve() returning UUID of the solver job
        }
    });
    // Extend jQuery to support $.put() and $.delete()
    jQuery.each(["put", "delete"], function (i, method) {
        jQuery[method] = function (url, data, callback, type) {
            if (jQuery.isFunction(data)) {
                type = type || callback;
                callback = data;
                data = undefined;
            }
            return jQuery.ajax({
                url: url,
                type: method,
                dataType: type,
                data: data,
                success: callback
            });
        };
    });
}

function fetchDemoData() {
    console.log("fetchDemoData() called");
    fetch("/demo-data")
        .then(response => {
            console.log("Demo data list response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Demo data list received:", data);
            data.forEach(item => {
                console.log("Adding demo data option:", item);
                $("#testDataDropdown").append($('<a id="' + item + 'TestData" class="dropdown-item" href="#">' + item + '</a>'));
                $("#" + item + "TestData").click(function () {
                    console.log("Demo data option clicked:", item);
                    switchDataDropDownItemActive(item);
                    scheduleId = null;
                    demoDataId = item;

                    refreshSchedule();
                });
            });
            demoDataId = data[0];
            console.log("Setting default demoDataId to:", demoDataId);
            switchDataDropDownItemActive(demoDataId);
            refreshSchedule();
        })
        .catch(error => {
            console.error("Failed to fetch demo data list:", error);
            // disable this page as there is no data
            let $demo = $("#demo");
            $demo.empty();
            $demo.html("<h1><p align=\"center\">No test data available</p></h1>")
        });
}

function switchDataDropDownItemActive(newItem) {
    activeCssClass = "active";
    $("#testDataDropdown > a." + activeCssClass).removeClass(activeCssClass);
    $("#" + newItem + "TestData").addClass(activeCssClass);
}

function getShiftColor(shift, employee) {
    const shiftStart = JSJoda.LocalDateTime.parse(shift.start);
    const shiftStartDateString = shiftStart.toLocalDate().toString();
    const shiftEnd = JSJoda.LocalDateTime.parse(shift.end);
    const shiftEndDateString = shiftEnd.toLocalDate().toString();
    if (employee.unavailableDates.includes(shiftStartDateString) ||
        // The contains() check is ignored for a shift end at midnight (00:00:00).
        (shiftEnd.isAfter(shiftStart.toLocalDate().plusDays(1).atStartOfDay()) &&
            employee.unavailableDates.includes(shiftEndDateString))) {
        return UNAVAILABLE_COLOR
    } else if (employee.undesiredDates.includes(shiftStartDateString) ||
        // The contains() check is ignored for a shift end at midnight (00:00:00).
        (shiftEnd.isAfter(shiftStart.toLocalDate().plusDays(1).atStartOfDay()) &&
            employee.undesiredDates.includes(shiftEndDateString))) {
        return UNDESIRED_COLOR
    } else if (employee.desiredDates.includes(shiftStartDateString) ||
        // The contains() check is ignored for a shift end at midnight (00:00:00).
        (shiftEnd.isAfter(shiftStart.toLocalDate().plusDays(1).atStartOfDay()) &&
            employee.desiredDates.includes(shiftEndDateString))) {
        return DESIRED_COLOR
    } else {
        return NORMAL_COLOR;
    }
}

function refreshSchedule() {
    console.log("refreshSchedule() called, scheduleId:", scheduleId, "demoDataId:", demoDataId);
    let path = "/schedules/" + scheduleId;
    if (scheduleId === null) {
        if (demoDataId === null) {
            console.log("Both scheduleId and demoDataId are null");
            alert("Please select a test data set.");
            return;
        }

        path = "/demo-data/" + demoDataId;
    }
    console.log("Fetching schedule from path:", path);
    $.getJSON(path, function (schedule) {
        console.log("Schedule fetched successfully:", schedule);
        loadedSchedule = schedule;
        renderSchedule(schedule);
    })
        .fail(function (xhr, ajaxOptions, thrownError) {
            console.error("Failed to get schedule:", xhr, thrownError);
            showError("Getting the schedule has failed.", xhr);
            refreshSolvingButtons(false);
        });
}

function renderSchedule(schedule) {
    refreshSolvingButtons(schedule.solverStatus != null && schedule.solverStatus !== "NOT_SOLVING");
    
    // Enhanced score display with better formatting
    const scoreText = schedule.score == null ? "?" : schedule.score;
    $("#score").html(`<i class="fas fa-chart-line"></i> Score: <span class="fw-bold">${scoreText}</span>`);

    const unassignedShifts = $("#unassignedShifts");
    const groups = [];

    // Show only first 7 days of draft
    const scheduleStart = schedule.shifts.map(shift => JSJoda.LocalDateTime.parse(shift.start).toLocalDate()).sort()[0].toString();
    const scheduleEnd = JSJoda.LocalDate.parse(scheduleStart).plusDays(7).toString();

    windowStart = scheduleStart;
    windowEnd = scheduleEnd;

    unassignedShifts.children().remove();
    let unassignedShiftsCount = 0;
    byEmployeeGroupDataSet.clear();
    byLocationGroupDataSet.clear();

    byEmployeeItemDataSet.clear();
    byLocationItemDataSet.clear();

    schedule.employees.forEach((employee, index) => {
        // Enhanced employee group with better styling
        const employeeGroupElement = $('<div class="card-body p-3"/>')
            .append($(`<h5 class="card-title mb-2 fw-bold text-primary"/>`)
                .append(`<i class="fas fa-user-circle me-2"></i>${employee.name}`))
            .append($('<div class="skills-container"/>')
                .append($(employee.skills.map(skill => 
                    `<span class="badge me-1 mt-1" style="background: linear-gradient(135deg, #D4A5A5 0%, #E4B5B5 100%); color: #2C1810; border-radius: 8px; font-weight: 500;">
                        <i class="fas fa-star me-1"></i>${skill}
                    </span>`).join(''))));
        
        byEmployeeGroupDataSet.add({id: employee.name, content: employeeGroupElement.html()});

        // Enhanced availability indicators
        employee.unavailableDates.forEach((rawDate, dateIndex) => {
            const date = JSJoda.LocalDate.parse(rawDate)
            const start = date.atStartOfDay().toString();
            const end = date.plusDays(1).atStartOfDay().toString();
            const byEmployeeShiftElement = $(`<div class="availability-indicator unavailable"/>`)
                .append(`<i class="fas fa-times-circle me-1"></i>Unavailable`)
                .css({
                    'background': 'linear-gradient(135deg, #E8B4B8 0%, #F2C2C6 100%)',
                    'color': '#2C1810',
                    'padding': '8px 12px',
                    'border-radius': '8px',
                    'font-size': '0.9rem',
                    'font-weight': '500'
                });
            byEmployeeItemDataSet.add({
                id: employee.name + "unavailable" + dateIndex,
                group: employee.name,
                start: start,
                end: end,
                content: byEmployeeShiftElement.html(),
                type: 'background',
                className: 'unavailable-background'
            });
        });

        employee.undesiredDates.forEach((rawDate, dateIndex) => {
            const date = JSJoda.LocalDate.parse(rawDate)
            const start = date.atStartOfDay().toString();
            const end = date.plusDays(1).atStartOfDay().toString();
            const byEmployeeShiftElement = $(`<div class="availability-indicator undesired"/>`)
                .append(`<i class="fas fa-exclamation-triangle me-1"></i>Undesired`)
                .css({
                    'background': 'linear-gradient(135deg, #F4D1AE 0%, #F8DCC8 100%)',
                    'color': '#2C1810',
                    'padding': '8px 12px',
                    'border-radius': '8px',
                    'font-size': '0.9rem',
                    'font-weight': '500'
                });
            byEmployeeItemDataSet.add({
                id: employee.name + "undesired" + dateIndex,
                group: employee.name,
                start: start,
                end: end,
                content: byEmployeeShiftElement.html(),
                type: 'background',
                className: 'undesired-background'
            });
        });

        employee.desiredDates.forEach((rawDate, dateIndex) => {
            const date = JSJoda.LocalDate.parse(rawDate)
            const start = date.atStartOfDay().toString();
            const end = date.plusDays(1).atStartOfDay().toString();
            const byEmployeeShiftElement = $(`<div class="availability-indicator desired"/>`)
                .append(`<i class="fas fa-heart me-1"></i>Desired`)
                .css({
                    'background': 'linear-gradient(135deg, #A8D5BA 0%, #B8E6C9 100%)',
                    'color': '#2C1810',
                    'padding': '8px 12px',
                    'border-radius': '8px',
                    'font-size': '0.9rem',
                    'font-weight': '500'
                });
            byEmployeeItemDataSet.add({
                id: employee.name + "desired" + dateIndex,
                group: employee.name,
                start: start,
                end: end,
                content: byEmployeeShiftElement.html(),
                type: 'background',
                className: 'desired-background'
            });
        });
    });

    // Enhanced shift rendering with better styling
    schedule.shifts.forEach((shift, index) => {
        const shiftStart = JSJoda.LocalDateTime.parse(shift.start);
        const shiftEnd = JSJoda.LocalDateTime.parse(shift.end);
        const shiftColor = shift.employee ? getShiftColor(shift, shift.employee) : NORMAL_COLOR;
        
        // Enhanced shift content with icons and better formatting
        const shiftContent = shift.employee ? 
            `<div class="shift-item" style="background: linear-gradient(135deg, ${shiftColor} 0%, ${shiftColor}dd 100%); border-radius: 8px; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div class="shift-header">
                    <i class="fas fa-clock me-1"></i>${shiftStart.toLocalTime().toString().substring(0, 5)} - ${shiftEnd.toLocalTime().toString().substring(0, 5)}
                </div>
                <div class="shift-details">
                    <i class="fas fa-map-marker-alt me-1"></i>${shift.location}
                </div>
                <div class="shift-skill">
                    <i class="fas fa-star me-1"></i>${shift.requiredSkill}
                </div>
                <div class="shift-employee">
                    <i class="fas fa-user me-1"></i>${shift.employee.name}
                </div>
            </div>` :
            `<div class="shift-item unassigned" style="background: linear-gradient(135deg, #E8E4E1 0%, #F4E4D6 100%); border: 2px dashed #D4A5A5; border-radius: 8px; padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div class="shift-header">
                    <i class="fas fa-clock me-1"></i>${shiftStart.toLocalTime().toString().substring(0, 5)} - ${shiftEnd.toLocalTime().toString().substring(0, 5)}
                </div>
                <div class="shift-details">
                    <i class="fas fa-map-marker-alt me-1"></i>${shift.location}
                </div>
                <div class="shift-skill">
                    <i class="fas fa-star me-1"></i>${shift.requiredSkill}
                </div>
                <div class="shift-employee">
                    <i class="fas fa-question-circle me-1"></i>Unassigned
                </div>
            </div>`;

        byEmployeeItemDataSet.add({
            id: shift.id,
            group: shift.employee ? shift.employee.name : "Unassigned",
            start: shift.start,
            end: shift.end,
            content: shiftContent,
            className: shift.employee ? 'assigned-shift' : 'unassigned-shift'
        });

        byLocationItemDataSet.add({
            id: shift.id + "location",
            group: shift.location,
            start: shift.start,
            end: shift.end,
            content: shiftContent,
            className: shift.employee ? 'assigned-shift' : 'unassigned-shift'
        });

        if (!shift.employee) {
            unassignedShiftsCount++;
        }
    });

    // Enhanced location groups
    const locationSet = new Set(schedule.shifts.map(shift => shift.location));
    locationSet.forEach(location => {
        const locationGroupElement = $('<div class="card-body p-3"/>')
            .append($(`<h5 class="card-title mb-2 fw-bold text-primary"/>`)
                .append(`<i class="fas fa-building me-2"></i>${location}`));
        byLocationGroupDataSet.add({id: location, content: locationGroupElement.html()});
    });

    // Enhanced unassigned shifts display
    if (unassignedShiftsCount > 0) {
        unassignedShifts.html(`<span class="badge bg-warning text-dark" style="background: linear-gradient(135deg, #F4D1AE 0%, #F8DCC8 100%) !important; color: #2C1810 !important; border-radius: 8px; font-weight: 500;">
            <i class="fas fa-exclamation-triangle me-1"></i>${unassignedShiftsCount} unassigned shifts
        </span>`);
    } else {
        unassignedShifts.html(`<span class="badge bg-success text-dark" style="background: linear-gradient(135deg, #A8D5BA 0%, #B8E6C9 100%) !important; color: #2C1810 !important; border-radius: 8px; font-weight: 500;">
            <i class="fas fa-check-circle me-1"></i>All shifts assigned
        </span>`);
    }

    byEmployeeTimeline.setWindow(windowStart, windowEnd);
    byLocationTimeline.setWindow(windowStart, windowEnd);
}

function solve() {
    console.log("solve() called");
    if (demoDataId === null) {
        console.log("demoDataId is null, showing alert");
        alert("Please select a test data set.");
        return;
    }
    console.log("Fetching demo data for:", demoDataId);
    
    // Use fetch instead of jQuery for better error handling
    fetch("/demo-data/" + demoDataId)
        .then(response => {
            console.log("Demo data response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(schedule => {
            console.log("Demo data fetched successfully:", schedule);
            console.log("Posting schedule to /schedules");
            
            return fetch("/schedules", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/plain'
                },
                body: JSON.stringify(schedule)
            });
        })
        .then(response => {
            console.log("POST response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(jobId => {
            console.log("Solving started successfully, jobId:", jobId);
            scheduleId = jobId;
            refreshSolvingButtons(true);
            refreshSchedule();
            autoRefreshIntervalId = setInterval(refreshSchedule, 2000);
        })
        .catch(error => {
            console.error("Error in solve function:", error);
            showError("Failed to start solving: " + error.message);
        });
}

function analyze() {
    if (loadedSchedule === null) {
        alert("Please load a schedule first.");
        return;
    }
    $.put("/schedules/analyze", loadedSchedule, function (scoreAnalysis) {
        showScoreAnalysis(scoreAnalysis);
    }).fail(function (xhr, ajaxOptions, thrownError) {
        showError("Failed to analyze the schedule.", xhr);
    });
}

function showScoreAnalysis(scoreAnalysis) {
    const scoreAnalysisScoreLabel = $("#scoreAnalysisScoreLabel");
    const scoreAnalysisModalContent = $("#scoreAnalysisModalContent");
    scoreAnalysisScoreLabel.text(scoreAnalysis.score);
    scoreAnalysisModalContent.empty();

    const constraintMatchCount = scoreAnalysis.constraintMap.size;
    const constraintMatchCountElement = $('<div class="mb-3"/>')
        .append($('<h5/>').text("Constraint Analysis"))
        .append($('<p/>').text("Found " + constraintMatchCount + " constraint matches."));

    scoreAnalysisModalContent.append(constraintMatchCountElement);

    if (constraintMatchCount === 0) {
        scoreAnalysisModalContent.append($('<p/>').text("No constraint matches found."));
    } else {
        const table = $('<table class="table table-striped"/>');
        const thead = $('<thead/>')
            .append($('<tr/>')
                .append($('<th/>').text("Constraint"))
                .append($('<th/>').text("Score"))
                .append($('<th/>').text("Matches")));
        table.append(thead);

        const tbody = $('<tbody/>');
        scoreAnalysis.constraintMap.forEach((constraintMatchTotal, constraintName) => {
            const row = $('<tr/>')
                .append($('<td/>').text(constraintName))
                .append($('<td/>').text(constraintMatchTotal.score))
                .append($('<td/>').text(constraintMatchTotal.matchCount));
            tbody.append(row);
        });
        table.append(tbody);
        scoreAnalysisModalContent.append(table);
    }

    const scoreAnalysisModal = new bootstrap.Modal(document.getElementById('scoreAnalysisModal'));
    scoreAnalysisModal.show();
}

function getScoreComponents(score) {
    if (score == null) {
        return "?";
    }
    return score.toString();
}

function refreshSolvingButtons(solving) {
    const solveButton = $("#solveButton");
    const stopSolvingButton = $("#stopSolvingButton");
    const analyzeButton = $("#analyzeButton");

    if (solving) {
        solveButton.prop('disabled', true)
            .html('<span class="loading-spinner me-2"></span><span class="solving-text">Optimizing Schedule...</span>')
            .addClass('solving-active');
        stopSolvingButton.prop('disabled', false)
            .removeClass('btn-danger')
            .addClass('btn-warning')
            .html('<span class="fas fa-stop"></span> Stop Optimization');
        analyzeButton.prop('disabled', true);
        
        // Add pulsing animation to the solve button
        solveButton.css({
            'animation': 'pulse 2s infinite',
            'background': 'linear-gradient(135deg, #A8D5BA 0%, #B8E6C9 100%)'
        });
    } else {
        solveButton.prop('disabled', false)
            .html('<span class="fas fa-play"></span> Start Optimization')
            .removeClass('solving-active')
            .css({
                'animation': 'none',
                'background': 'linear-gradient(135deg, #A8D5BA 0%, #B8E6C9 100%)'
            });
        stopSolvingButton.prop('disabled', true)
            .removeClass('btn-warning')
            .addClass('btn-danger')
            .html('<span class="fas fa-stop"></span> Stop Solving');
        analyzeButton.prop('disabled', false);
    }
}

function showError(message, xhr) {
    const notificationPanel = $("#notificationPanel");
    const errorDiv = $('<div class="alert alert-danger alert-dismissible fade show" role="alert"/>')
        .append($('<strong/>').text("Error: "))
        .append(message)
        .append($('<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"/>'));
    notificationPanel.append(errorDiv);
    setTimeout(function () {
        errorDiv.alert('close');
    }, 5000);
}

function stopSolving() {
    if (scheduleId === null) {
        alert("No solving in progress.");
        return;
    }
    $.delete("/schedules/" + scheduleId, function (schedule) {
        loadedSchedule = schedule;
        refreshSolvingButtons(false);
        if (autoRefreshIntervalId !== null) {
            clearInterval(autoRefreshIntervalId);
            autoRefreshIntervalId = null;
        }
        renderSchedule(schedule);
    }).fail(function (xhr, ajaxOptions, thrownError) {
        showError("Failed to stop solving.", xhr);
    });
}

function replaceQuickstartSukanyaGhoshAutoHeaderFooter() {
    const sukanyaGhoshHeader = $("header#sukanya-ghosh-auto-header");
    if (sukanyaGhoshHeader != null) {
        sukanyaGhoshHeader.addClass("bg-black")
            .append(
                `<nav class="navbar navbar-expand-lg navbar-dark bg-black">
                    <div class="container-fluid">
                        <a class="navbar-brand" href="https://sukanya-ghosh.ai">
                            <span style="font-size:2rem;font-weight:700;letter-spacing:1px;">Sukanya Ghosh</span>
                        </a>
                        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
                                aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                            <span class="navbar-toggler-icon"></span>
                        </button>
                        <div class="collapse navbar-collapse" id="navbarNav">
                            <ul class="navbar-nav ms-auto">
                                <li class="nav-item">
                                    <a class="nav-link" href="#demo" data-bs-toggle="tab">Demo</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="#rest" data-bs-toggle="tab">REST API</a>
                                </li>
                                <li class="nav-item">
                                    <a class="nav-link" href="#openapi" data-bs-toggle="tab">OpenAPI</a>
                                </li>
                            </ul>
                        </div>
                    </div>
                </nav>`
            );
    }

    const sukanyaGhoshFooter = $("footer#sukanya-ghosh-auto-footer");
    if (sukanyaGhoshFooter != null) {
        sukanyaGhoshFooter.append(
            `<div class="bg-black text-white py-3">
                <div class="container-fluid d-flex justify-content-between align-items-center">
                    <div class="ms-auto"><a class="text-white" href="https://sukanya-ghosh.ai">Sukanya Ghosh</a></div>
                    <div class="mx-3">|</div>
                    <div><a class="text-white" href="https://sukanya-ghosh.ai/docs">Documentation</a></div>
                    <div class="mx-3">|</div>
                    <div><a class="text-white" href="https://github.com/SukanyaGhoshAI/sukanya-ghosh-quickstarts">Code</a></div>
                    <div class="mx-3">|</div>
                    <div class="me-auto"><a class="text-white" href="https://sukanya-ghosh.ai/product/support/">Support</a></div>
                </div>
            </div>`
        );
    }
}
