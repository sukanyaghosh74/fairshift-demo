let autoRefreshIntervalId = null;
const formatter = JSJoda.DateTimeFormatter.ofPattern("MM/dd/YYYY HH:mm").withLocale(JSJodaLocale.Locale.ENGLISH);

const zoomMin = 1000 * 60 * 60 * 24 // 1 day in milliseconds
const zoomMax = 3 * 7 * 1000 * 60 * 60 * 24 // 3 weeks in milliseconds

const byTimelineOptions = {
    timeAxis: {scale: "day"},
    orientation: {axis: "top"},
    stack: false,
    xss: {disabled: true}, // Items are XSS safe through JQuery
    zoomMin: zoomMin,
    zoomMax: zoomMax,
    showCurrentTime: false,
};

const byTeamPanel = document.getElementById("byTeamPanel");
let byTeamGroupData = new vis.DataSet();
let byTeamItemData = new vis.DataSet();
let byTeamTimeline = new vis.Timeline(byTeamPanel, byTeamItemData, byTeamGroupData, byTimelineOptions);

const byConfrontationPanel = document.getElementById("byConfrontationPanel");

const teamsTable = $('#teams');

let scheduleId = null;
let loadedSchedule = null;
let viewType = "T";

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
    $("#byTeamTab").click(function () {
        viewType = "T";
        refreshSchedule();
    });
    $("#byConfrontationTab").click(function () {
        viewType = "C";
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

    if (viewType === "T") {
        renderScheduleByTeam(schedule);
    }
    if (viewType === "C") {
        renderScheduleByConfrontation(schedule);
    }
}

function renderScheduleByTeam(schedule) {
    const unassigned = $("#unassigned");
    unassigned.children().remove();
    let unassignedCount = 0;
    byTeamGroupData.clear();
    byTeamItemData.clear();
    const currentDate = JSJoda.LocalDate.now();

    $.each(schedule.teams.sort((t1, t2) => t1.name.localeCompare(t2.name)), (_, team) => {
        let content = `<div class="d-flex flex-column"><div><h5 class="card-title mb-1">${team.name}</h5></div>`;
        byTeamGroupData.add({
            id: team.id,
            content: content,
        });
    });

    $.each(schedule.unavailabilityPenalties, (_, unavailability) => {
        const unavailableDatetime = currentDate.plusDays(unavailability.day);
        byTeamItemData.add({
            id: `u${unavailability.team}-${unavailability.day}`,
            group: unavailability.team,
            content: $(`<div />`).html(),
            start: unavailableDatetime.atStartOfDay().toString(),
            end: unavailableDatetime.atStartOfDay().withHour(23).withMinute(59).toString(),
            style: "background-color: gray; min-height: 50px"
        });
    });

    $.each(schedule.teamAssignments, (_, assignment) => {
        if (assignment.team == null) {
            unassignedCount++;
            const unassignedElement = $(`<div class="card-body"/>`)
                .append($(`<h5 class="card-title mb-1"/>`).text(`${currentDate.plusDays(assignment.day).toString()} - Match ${assignment.indexInDay + 1}`));

            unassigned.append($(`<div class="pl-1"/>`).append($(`<div class="card"/>`).append(unassignedElement)));
        } else {
            const matchDateTime = currentDate.plusDays(assignment.day);
            const element = $(`<div />`).append($(`<div class="d-flex justify-content-center"/>`).append($(`<h5 class="card-title mb-1"/>`).text(`Match ${assignment.indexInDay + 1}`)));
            byTeamItemData.add({
                id: `a${assignment.team}-${assignment.day}`,
                group: assignment.team,
                content: element.html(),
                start: matchDateTime.atStartOfDay().toString(),
                end: matchDateTime.atStartOfDay().withHour(23).withMinute(59).toString(),
                style: `background-color: ${pickColor(assignment.team)}; min-height: 50px`
            });
        }
    });
    if (unassignedCount === 0) {
        unassigned.append($(`<p/>`).text(`There are no unassigned team.`));
    }
    byTeamTimeline.setWindow(JSJoda.LocalDateTime.now().minusDays(1).toString(),
        JSJoda.LocalDateTime.now().plusDays(7).withHour(23).withMinute(59).toString());
}

function renderScheduleByConfrontation(schedule) {
    const unassigned = $("#unassigned");
    unassigned.children().remove();
    let unassignedCount = 0;
    const tableByConfrontation = $("#tableByConfrontation");
    tableByConfrontation.children().remove();
    const currentDate = JSJoda.LocalDate.now();

    const theadByTeam = $("<thead>").appendTo(tableByConfrontation);
    const headerRowByTeam = $("<tr>").appendTo(theadByTeam);
    headerRowByTeam.append($("<th></th>"));

    const tbodyByTeam = $("<tbody>").appendTo(tableByConfrontation);

    const teamConfrontationCount = new Map();
    $.each(schedule.teams.sort((t1, t2) => t1.name.localeCompare(t2.name)), (_, team) => {
        headerRowByTeam
            .append($("<th/>")
                .append($("<span/>").text(team.name))
                .append($(`<button type="button" class="ms-2 mb-1 btn btn-light btn-sm p-1"/>`)));

        const rowByTeam = $("<tr>").appendTo(tbodyByTeam);
        rowByTeam
            .append($(`<th class="align-middle"/>`)
                .append($("<span/>").text(team.name)));
        $.each(schedule.teams, (index, otherTeam) => {
            if (team.id !== otherTeam.id) {
                teamConfrontationCount.set(`match-${team.id}-${otherTeam.id}`, 0);
            }
            rowByTeam.append($("<td/>").prop("id", `match-${team.id}-${otherTeam.id}`));
        });
    });

    const teamDayCount = new Map();
    const teamsPerDay = new Map();
    $.each(schedule.teamAssignments, (_, assignment) => {
        if (assignment.team == null) {
            unassignedCount++;
            const unassignedElement = $(`<div class="card-body"/>`)
                .append($(`<h5 class="card-title mb-1"/>`).text(`${currentDate.plusDays(assignment.day).toString()} - Match ${assignment.indexInDay + 1}`));

            unassigned.append($(`<div class="pl-1"/>`).append($(`<div class="card"/>`).append(unassignedElement)));
        } else {
            if (teamDayCount.get(assignment.team)) {
                teamDayCount.set(assignment.team, teamDayCount.get(assignment.team) + 1);
            } else {
                teamDayCount.set(assignment.team, 1);
            }
            let teams = teamsPerDay.get(assignment.day);
            if (teams) {
                teams.push(assignment.team);
            } else {
                teams = [assignment.team];
                teamsPerDay.set(assignment.day, teams);
            }
        }
    });

    teamsPerDay.forEach((value, _) => {
        for (const left of value) {
            for (const right of value) {
                if (left !== right) {
                    const key = `match-${left}-${right}`;
                    const count = teamConfrontationCount.get(key);
                    teamConfrontationCount.set(key, count + 1);
                }
            }
        }
    });

    teamConfrontationCount.forEach((value, key) => {
        $(`#${key}`).append($(`<span />`).text(value));
    });

    if (teamDayCount.size > 0) {
        teamsTable.children().remove();
        $.each(schedule.teams.sort((t1, t2) => t1.name.localeCompare(t2.name)), (_, team) => {
            teamsTable.append(`
      <tr class="m-3">
        <td class="text-xl-center">${team.name}</td>
        <td class="text-xl-center">${teamDayCount.get(team.id)}</td>
      </tr>`);
        });
    }

    if (unassignedCount === 0) {
        unassigned.append($(`<p/>`).text(`There are no unassigned team.`));
    }
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

    $.each([...score.matchAll(/(-?\d*(\.\d+)?)(hard|medium|soft)/g)], (i, parts) => {
        components[parts[3]] = parseFloat(parts[1], 10);
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
