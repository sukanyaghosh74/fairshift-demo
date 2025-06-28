let autoRefreshIntervalId = null;
const formatter = JSJoda.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withLocale(JSJodaLocale.Locale.ENGLISH);
const startTime = formatter.format(JSJoda.LocalDateTime.now().withHour(20).withMinute(0).withSecond(0));
const endTime = formatter.format(JSJoda.LocalDateTime.now().plusDays(1).withHour(8).withMinute(0).withSecond(0));
const zoomMin = 1000 * 60 * 60 // one hour in milliseconds
const zoomMax = 4 * 1000 * 60 * 60 * 24 // 5 days in milliseconds

const byTimelineOptions = {
    timeAxis: {scale: "hour", step: 1},
    orientation: {axis: "top"},
    stack: false,
    xss: {disabled: true}, // Items are XSS safe through JQuery
    zoomMin: zoomMin,
    zoomMax: zoomMax,
    showCurrentTime: false,
    hiddenDates: [
        {
            start: startTime,
            end: endTime,
            repeat: 'daily'
        }
    ],
};

const byRoomPanel = document.getElementById("byRoomPanel");
let byRoomGroupData = new vis.DataSet();
let byRoomItemData = new vis.DataSet();
let byRoomTimeline = new vis.Timeline(byRoomPanel, byRoomItemData, byRoomGroupData, byTimelineOptions);

const byPersonPanel = document.getElementById("byPersonPanel");
let byPersonGroupData = new vis.DataSet();
let byPersonItemData = new vis.DataSet();
let byPersonTimeline = new vis.Timeline(byPersonPanel, byPersonItemData, byPersonGroupData, byTimelineOptions);

let scheduleId = null;
let loadedSchedule = null;
let viewType = "R";

$(document).ready(function () {
    replaceQuickstartTimefoldAutoHeaderFooter();

    $("#solveButton").click(function () {
        solve();
    });
    $("#stopSolvingButton").click(function () {
        stopSolving();
    });
    $("#analyzeButton").click(function () {
        analyze();
    });
    $("#byRoomTab").click(function () {
        viewType = "R";
        byRoomTimeline.redraw();
        refreshSchedule();
    });
    $("#byPersonTab").click(function () {
        viewType = "P";
        byPersonTimeline.redraw();
        refreshSchedule();
    });
    setupAjax();
    refreshSchedule();
});

function setupAjax() {
    $.ajaxSetup({
        headers: {
            'Content-Type': 'application/json', 'Accept': 'application/json,text/plain', // plain text is required by solve() returning UUID of the solver job
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
                url: url, type: method, dataType: type, data: data, success: callback
            });
        };
    });
}

function refreshSchedule() {
    let path = "/schedules/" + scheduleId;
    if (scheduleId === null) {
        path = "/demo-data";
    }

    $.getJSON(path, function (schedule) {
        loadedSchedule = schedule;
        $('#exportData').attr('href', 'data:text/plain;charset=utf-8,' + JSON.stringify(loadedSchedule));
        renderSchedule(schedule);
    })
        .fail(function (xhr, ajaxOptions, thrownError) {
            showError("Getting the schedule has failed.", xhr);
            refreshSolvingButtons(false);
        });
}

function renderSchedule(schedule) {
    refreshSolvingButtons(schedule.solverStatus != null && schedule.solverStatus !== "NOT_SOLVING");
    $("#score").text("Score: " + (schedule.score == null ? "?" : schedule.score));

    if (viewType === "R") {
        renderScheduleByRoom(schedule);
    }
    if (viewType === "P") {
        renderScheduleByPerson(schedule);
    }
}

function renderScheduleByRoom(schedule) {
    const unassigned = $("#unassigned");
    unassigned.children().remove();
    byRoomGroupData.clear();
    byRoomItemData.clear();

    $.each(schedule.rooms.sort((e1, e2) => e1.name.localeCompare(e2.name)), (_, room) => {
        let content = `<div class="d-flex flex-column"><div><h5 class="card-title mb-1">${room.name}</h5></div>`;
        byRoomGroupData.add({
            id: room.id,
            content: content,
        });
    });

    const meetingMap = new Map();
    schedule.meetings.forEach(m => meetingMap.set(m.id, m));
    const timeGrainMap = new Map();
    schedule.timeGrains.forEach(t => timeGrainMap.set(t.id, t));
    $.each(schedule.meetingAssignments, (_, assignment) => {
        const meet = meetingMap.get(assignment.meeting);
        if (assignment.room == null || assignment.startingTimeGrain == null) {
            const unassignedElement = $(`<div class="card-body"/>`)
                .append($(`<h5 class="card-title mb-1"/>`).text(meet.topic))
                .append($(`<p class="card-text ms-2 mb-0"/>`).text(`${(meet.durationInGrains * 15) / 60} hour(s)`));

            unassigned.append($(`<div class="pl-1"/>`).append($(`<div class="card"/>`).append(unassignedElement)));
        } else {
            const byRoomElement = $("<div />").append($("<div class='d-flex justify-content-center' />").append($(`<h5 class="card-title mb-1"/>`).text(meet.topic)));
            const timeGrain = timeGrainMap.get(assignment.startingTimeGrain);
            const startDate = JSJoda.LocalDate.now().withDayOfYear(timeGrain.dayOfYear);
            const startTime = JSJoda.LocalTime.of(0, 0, 0, 0)
                .plusMinutes(timeGrain.startingMinuteOfDay);
            const startDateTime = JSJoda.LocalDateTime.of(startDate, startTime);
            const endDateTime = startTime.plusMinutes(meet.durationInGrains * 15);
            byRoomItemData.add({
                id: assignment.id,
                group: assignment.room,
                content: byRoomElement.html(),
                start: startDateTime.toString(),
                end: endDateTime.toString(),
                style: "min-height: 50px"
            });
        }
    });

    byRoomTimeline.setWindow(JSJoda.LocalDateTime.now().plusDays(1).withHour(8).toString(),
        JSJoda.LocalDateTime.now().plusDays(1).withHour(17).withMinute(45).toString());
}

function renderScheduleByPerson(schedule) {
    const unassigned = $("#unassigned");
    unassigned.children().remove();
    byPersonGroupData.clear();
    byPersonItemData.clear();

    $.each(schedule.people.sort((e1, e2) => e1.fullName.localeCompare(e2.fullName)), (_, person) => {
        let content = `<div class="d-flex flex-column"><div><h5 class="card-title mb-1">${person.fullName}</h5></div>`;
        byPersonGroupData.add({
            id: person.id,
            content: content,
        });
    });
    const meetingMap = new Map();
    schedule.meetings.forEach(m => meetingMap.set(m.id, m));
    const timeGrainMap = new Map();
    schedule.timeGrains.forEach(t => timeGrainMap.set(t.id, t));
    $.each(schedule.meetingAssignments, (_, assignment) => {
        const meet = meetingMap.get(assignment.meeting);
        if (assignment.room == null || assignment.startingTimeGrain == null) {
            const unassignedElement = $(`<div class="card-body"/>`)
                .append($(`<h5 class="card-title mb-1"/>`).text(meet.topic))
                .append($(`<p class="card-text ms-2 mb-0"/>`).text(`${(meet.durationInGrains * 15) / 60} hour(s)`));

            unassigned.append($(`<div class="pl-1"/>`).append($(`<div class="card"/>`).append(unassignedElement)));
        } else {
            const timeGrain = timeGrainMap.get(assignment.startingTimeGrain);
            const startDate = JSJoda.LocalDate.now().withDayOfYear(timeGrain.dayOfYear);
            const startTime = JSJoda.LocalTime.of(0, 0, 0, 0)
                .plusMinutes(timeGrain.startingMinuteOfDay);
            const startDateTime = JSJoda.LocalDateTime.of(startDate, startTime);
            const endDateTime = startTime.plusMinutes(meet.durationInGrains * 15);
            meet.requiredAttendances.forEach(attendance => {
                const byPersonElement = $("<div />").append($("<div class='d-flex justify-content-center' />").append($(`<h5 class="card-title mb-1"/>`).text(meet.topic)));
                byPersonElement.append($("<div class='d-flex justify-content-center' />").append($(`<span class="badge text-bg-success m-1" style="background-color: ${pickColor(meet.id)}" />`).text("Required")));
                if (meet.preferredAttendances.map(a => a.person).indexOf(attendance.person) >= 0) {
                    byPersonElement.append($("<div class='d-flex justify-content-center' />").append($(`<span class="badge text-bg-info m-1" style="background-color: ${pickColor(meet.id)}" />`).text("Preferred")));
                }
                byPersonItemData.add({
                    id: `${assignment.id}-${attendance.person}`,
                    group: attendance.person,
                    content: byPersonElement.html(),
                    start: startDateTime.toString(),
                    end: endDateTime.toString(),
                    style: "min-height: 50px"
                });
            });
            meet.preferredAttendances.forEach(attendance => {
                if (meet.requiredAttendances.map(a => a.person).indexOf(attendance.person) === -1) {
                    const byPersonElement = $("<div />").append($("<div class='d-flex justify-content-center' />").append($(`<h5 class="card-title mb-1"/>`).text(meet.topic)));
                    byPersonElement.append($("<div class='d-flex justify-content-center' />").append($(`<span class="badge text-bg-info m-1" style="background-color: ${pickColor(meet.id)}" />`).text("Preferred")));
                    byPersonItemData.add({
                        id: `${assignment.id}-${attendance.person}`,
                        group: attendance.person,
                        content: byPersonElement.html(),
                        start: startDateTime.toString(),
                        end: endDateTime.toString(),
                        style: "min-height: 50px"
                    });
                }
            });
        }
    });

    byPersonTimeline.setWindow(JSJoda.LocalDateTime.now().plusDays(1).withHour(8).toString(),
        JSJoda.LocalDateTime.now().plusDays(1).withHour(17).withMinute(45).toString());
}

function solve() {
    $.post("/schedules", JSON.stringify(loadedSchedule), function (data) {
        scheduleId = data;
        refreshSolvingButtons(true);
    }).fail(function (xhr, ajaxOptions, thrownError) {
        showError("Start solving failed.", xhr);
        refreshSolvingButtons(false);
    }, "text");
}

function analyze() {
    new bootstrap.Modal("#scoreAnalysisModal").show()
    const scoreAnalysisModalContent = $("#scoreAnalysisModalContent");
    scoreAnalysisModalContent.children().remove();
    if (loadedSchedule.score == null) {
        scoreAnalysisModalContent.text("No score to analyze yet, please first press the 'solve' button.");
    } else {
        $('#scoreAnalysisScoreLabel').text(`(${loadedSchedule.score})`);
        $.put("/schedules/analyze", JSON.stringify(loadedSchedule), function (scoreAnalysis) {
            let constraints = scoreAnalysis.constraints;
            constraints.sort((a, b) => {
                let aComponents = getScoreComponents(a.score), bComponents = getScoreComponents(b.score);
                if (aComponents.hard < 0 && bComponents.hard > 0) return -1;
                if (aComponents.hard > 0 && bComponents.soft < 0) return 1;
                if (Math.abs(aComponents.hard) > Math.abs(bComponents.hard)) {
                    return -1;
                } else {
                    if (aComponents.medium < 0 && bComponents.medium > 0) return -1;
                    if (aComponents.medium > 0 && bComponents.medium < 0) return 1;
                    if (Math.abs(aComponents.medium) > Math.abs(bComponents.medium)) {
                        return -1;
                    } else {
                        if (aComponents.soft < 0 && bComponents.soft > 0) return -1;
                        if (aComponents.soft > 0 && bComponents.soft < 0) return 1;

                        return Math.abs(bComponents.soft) - Math.abs(aComponents.soft);
                    }
                }
            });
            constraints.map((e) => {
                let components = getScoreComponents(e.weight);
                e.type = components.hard != 0 ? 'hard' : (components.medium != 0 ? 'medium' : 'soft');
                e.weight = components[e.type];
                let scores = getScoreComponents(e.score);
                e.implicitScore = scores.hard != 0 ? scores.hard : (scores.medium != 0 ? scores.medium : scores.soft);
            });
            scoreAnalysis.constraints = constraints;

            scoreAnalysisModalContent.children().remove();
            scoreAnalysisModalContent.text("");

            const analysisTable = $(`<table class="table"/>`).css({textAlign: 'center'});
            const analysisTHead = $(`<thead/>`).append($(`<tr/>`)
                .append($(`<th></th>`))
                .append($(`<th>Constraint</th>`).css({textAlign: 'left'}))
                .append($(`<th>Type</th>`))
                .append($(`<th># Matches</th>`))
                .append($(`<th>Weight</th>`))
                .append($(`<th>Score</th>`))
                .append($(`<th></th>`)));
            analysisTable.append(analysisTHead);
            const analysisTBody = $(`<tbody/>`)
            $.each(scoreAnalysis.constraints, (index, constraintAnalysis) => {
                let icon = constraintAnalysis.type == "hard" && constraintAnalysis.implicitScore < 0 ? '<span class="fas fa-exclamation-triangle" style="color: red"></span>' : '';
                if (!icon) icon = constraintAnalysis.matches.length == 0 ? '<span class="fas fa-check-circle" style="color: green"></span>' : '';

                let row = $(`<tr/>`);
                row.append($(`<td/>`).html(icon))
                    .append($(`<td/>`).text(constraintAnalysis.name).css({textAlign: 'left'}))
                    .append($(`<td/>`).text(constraintAnalysis.type))
                    .append($(`<td/>`).html(`<b>${constraintAnalysis.matches.length}</b>`))
                    .append($(`<td/>`).text(constraintAnalysis.weight))
                    .append($(`<td/>`).text(constraintAnalysis.implicitScore));
                analysisTBody.append(row);
                row.append($(`<td/>`));
            });
            analysisTable.append(analysisTBody);
            scoreAnalysisModalContent.append(analysisTable);
        }).fail(function (xhr, ajaxOptions, thrownError) {
            showError("Analyze failed.", xhr);
        }, "text");
    }
}

function getScoreComponents(score) {
    let components = {hard: 0, medium: 0, soft: 0};

    $.each([...score.matchAll(/(-?[0-9]+)(hard|medium|soft)/g)], (i, parts) => {
        components[parts[2]] = parseInt(parts[1], 10);
    });

    return components;
}

function refreshSolvingButtons(solving) {
    if (solving) {
        $("#solveButton").hide();
        $("#stopSolvingButton").show();
        if (autoRefreshIntervalId == null) {
            autoRefreshIntervalId = setInterval(refreshSchedule, 2000);
        }
    } else {
        $("#solveButton").show();
        $("#stopSolvingButton").hide();
        if (autoRefreshIntervalId != null) {
            clearInterval(autoRefreshIntervalId);
            autoRefreshIntervalId = null;
        }
    }
}

function stopSolving() {
    $.delete("/schedules/" + scheduleId, function () {
        refreshSolvingButtons(false);
        refreshSchedule();
    }).fail(function (xhr, ajaxOptions, thrownError) {
        showError("Stop solving failed.", xhr);
    });
}

function copyTextToClipboard(id) {
    var text = $("#" + id).text().trim();

    var dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = text;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
}

// TODO: move to the webjar
function replaceQuickstartTimefoldAutoHeaderFooter() {
    const timefoldHeader = $("header#timefold-auto-header");
    if (timefoldHeader != null) {
        timefoldHeader.addClass("bg-black")
        timefoldHeader.append($(`<div class="container-fluid">
        <nav class="navbar sticky-top navbar-expand-lg navbar-dark shadow mb-3">
          <a class="navbar-brand" href="https://timefold.ai">
            <img src="/webjars/timefold/img/timefold-logo-horizontal-negative.svg" alt="Timefold logo" width="200">
          </a>
          <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="nav nav-pills">
              <li class="nav-item active" id="navUIItem">
                <button class="nav-link active" id="navUI" data-bs-toggle="pill" data-bs-target="#demo" type="button">Demo UI</button>
              </li>
              <li class="nav-item" id="navRestItem">
                <button class="nav-link" id="navRest" data-bs-toggle="pill" data-bs-target="#rest" type="button">Guide</button>
              </li>
              <li class="nav-item" id="navOpenApiItem">
                <button class="nav-link" id="navOpenApi" data-bs-toggle="pill" data-bs-target="#openapi" type="button">REST API</button>
              </li>
            </ul>
          </div>
        </nav>
      </div>`));
    }

    const timefoldFooter = $("footer#timefold-auto-footer");
    if (timefoldFooter != null) {
        timefoldFooter.append($(`<footer class="bg-black text-white-50">
               <div class="container">
                 <div class="hstack gap-3 p-4">
                   <div class="ms-auto"><a class="text-white" href="https://timefold.ai">Timefold</a></div>
                   <div class="vr"></div>
                   <div><a class="text-white" href="https://timefold.ai/docs">Documentation</a></div>
                   <div class="vr"></div>
                   <div><a class="text-white" href="https://github.com/TimefoldAI/timefold-quickstarts">Code</a></div>
                   <div class="vr"></div>
                   <div class="me-auto"><a class="text-white" href="https://timefold.ai/product/support/">Support</a></div>
                 </div>
               </div>
             </footer>`));
    }
}
