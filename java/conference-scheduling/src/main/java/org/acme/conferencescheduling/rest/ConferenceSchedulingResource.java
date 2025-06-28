package org.acme.conferencescheduling.rest;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map.Entry;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import ai.timefold.solver.core.api.score.analysis.ScoreAnalysis;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.solver.ScoreAnalysisFetchPolicy;
import ai.timefold.solver.core.api.solver.SolutionManager;
import ai.timefold.solver.core.api.solver.SolverManager;
import ai.timefold.solver.core.api.solver.SolverStatus;

import org.acme.conferencescheduling.domain.ConferenceSchedule;
import org.acme.conferencescheduling.rest.exception.ConferenceScheduleSolverException;
import org.acme.conferencescheduling.rest.exception.ErrorInfo;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponses;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Tag(name = "Conference Scheduling",
        description = "Conference Scheduling service assigning rooms and timeslots for conference talks.")
@Path("schedules")
public class ConferenceSchedulingResource {

    private static final Logger LOGGER = LoggerFactory.getLogger(ConferenceSchedulingResource.class);
    private static final int MAX_JOBS_CACHE_SIZE = 2;

    private final SolverManager<ConferenceSchedule, String> solverManager;
    private final SolutionManager<ConferenceSchedule, HardSoftScore> solutionManager;
    private final ConcurrentMap<String, Job> jobIdToJob = new ConcurrentHashMap<>();

    // Workaround to make Quarkus CDI happy. Do not use.
    public ConferenceSchedulingResource() {
        this.solverManager = null;
        this.solutionManager = null;
    }

    @Inject
    public ConferenceSchedulingResource(SolverManager<ConferenceSchedule, String> solverManager,
            SolutionManager<ConferenceSchedule, HardSoftScore> solutionManager) {
        this.solverManager = solverManager;
        this.solutionManager = solutionManager;
    }

    @Operation(summary = "List the job IDs of all submitted schedules.")
    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "List of all job IDs.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(type = SchemaType.ARRAY, implementation = String.class))) })
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Collection<String> list() {
        return jobIdToJob.keySet();
    }

    @Operation(summary = "Submit a schedule to start solving as soon as CPU resources are available.")
    @APIResponses(value = {
            @APIResponse(responseCode = "202",
                    description = "The job ID. Use that ID to get the solution with the other methods.",
                    content = @Content(mediaType = MediaType.TEXT_PLAIN, schema = @Schema(implementation = String.class))) })
    @POST
    @Consumes({ MediaType.APPLICATION_JSON })
    @Produces(MediaType.TEXT_PLAIN)
    public String solve(ConferenceSchedule problem) {
        String jobId = UUID.randomUUID().toString();
        jobIdToJob.put(jobId, Job.ofSchedule(problem));
        solverManager.solveBuilder()
                .withProblemId(jobId)
                .withProblemFinder(id -> jobIdToJob.get(jobId).schedule)
                .withBestSolutionConsumer(solution -> jobIdToJob.put(jobId, Job.ofSchedule(solution)))
                .withExceptionHandler((id, exception) -> {
                    jobIdToJob.put(id, Job.ofException(exception));
                    LOGGER.error("Failed solving jobId ({}).", id, exception);
                })
                .run();
        cleanJobs();
        return jobId;
    }

    @Operation(summary = "Submit a schedule to analyze its score.")
    @APIResponses(value = {
            @APIResponse(responseCode = "202",
                    description = "Resulting score analysis, optionally without constraint matches.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ScoreAnalysis.class))) })
    @PUT
    @Consumes({ MediaType.APPLICATION_JSON })
    @Produces(MediaType.APPLICATION_JSON)
    @Path("analyze")
    public ScoreAnalysis<HardSoftScore> analyze(ConferenceSchedule problem,
            @QueryParam("fetchPolicy") ScoreAnalysisFetchPolicy fetchPolicy) {
        return fetchPolicy == null ? solutionManager.analyze(problem) : solutionManager.analyze(problem, fetchPolicy);
    }

    @Operation(
            summary = "Get the solution and score for a given job ID. This is the best solution so far, as it might still be running or not even started.")
    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "The best solution of the schedule so far.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ConferenceSchedule.class))),
            @APIResponse(responseCode = "404", description = "No schedule found.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class))),
            @APIResponse(responseCode = "500", description = "Exception during solving a schedule.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class)))
    })
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("{jobId}")
    public ConferenceSchedule
            getConferenceSchedule(
                    @Parameter(description = "The job ID returned by the POST method.") @PathParam("jobId") String jobId) {
        ConferenceSchedule schedule = getScheduleAndCheckForExceptions(jobId);
        SolverStatus solverStatus = solverManager.getSolverStatus(jobId);
        schedule.setSolverStatus(solverStatus);
        return schedule;
    }

    @Operation(
            summary = "Get the schedule status and score for a given job ID.")
    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "The schedule status and the best score so far.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ConferenceSchedule.class))),
            @APIResponse(responseCode = "404", description = "No schedule found.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class))),
            @APIResponse(responseCode = "500", description = "Exception during solving a schedule.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class)))
    })
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Path("{jobId}/status")
    public ConferenceSchedule getStatus(
            @Parameter(description = "The job ID returned by the POST method.") @PathParam("jobId") String jobId) {
        ConferenceSchedule schedule = getScheduleAndCheckForExceptions(jobId);
        SolverStatus solverStatus = solverManager.getSolverStatus(jobId);
        return new ConferenceSchedule(schedule.getName(), schedule.getScore(), solverStatus);
    }

    @Operation(
            summary = "Terminate solving for a given job ID. Returns the best solution of the schedule so far, as it might still be running or not even started.")
    @APIResponses(value = {
            @APIResponse(responseCode = "200", description = "The best solution of the schedule so far.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ConferenceSchedule.class))),
            @APIResponse(responseCode = "404", description = "No schedule found.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class))),
            @APIResponse(responseCode = "500", description = "Exception during solving a schedule.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON,
                            schema = @Schema(implementation = ErrorInfo.class)))
    })
    @DELETE
    @Produces(MediaType.APPLICATION_JSON)
    @Path("{jobId}")
    public ConferenceSchedule terminateSolving(
            @Parameter(description = "The job ID returned by the POST method.") @PathParam("jobId") String jobId) {
        solverManager.terminateEarly(jobId);
        return getConferenceSchedule(jobId);
    }

    private ConferenceSchedule getScheduleAndCheckForExceptions(String jobId) {
        Job job = jobIdToJob.get(jobId);
        if (job == null) {
            throw new ConferenceScheduleSolverException(jobId, Response.Status.NOT_FOUND, "No schedule found.");
        }
        if (job.exception != null) {
            throw new ConferenceScheduleSolverException(jobId, job.exception);
        }
        return job.schedule;
    }

    /**
     * The method retains only the records of the last MAX_JOBS_CACHE_SIZE completed jobs by removing the oldest ones.
     */
    private void cleanJobs() {
        if (jobIdToJob.size() <= MAX_JOBS_CACHE_SIZE) {
            return;
        }
        List<String> jobsToRemove = jobIdToJob.entrySet().stream()
                .filter(e -> getStatus(e.getKey()).getSolverStatus() != SolverStatus.NOT_SOLVING)
                .filter(e -> jobIdToJob.get(e.getKey()).schedule() != null)
                .sorted((j1, j2) -> jobIdToJob.get(j1.getKey()).createdAt().compareTo(jobIdToJob.get(j2.getKey()).createdAt()))
                .map(Entry::getKey)
                .toList();
        if (jobsToRemove.size() > MAX_JOBS_CACHE_SIZE) {
            for (int i = 0; i < jobsToRemove.size() - MAX_JOBS_CACHE_SIZE; i++) {
                jobIdToJob.remove(jobsToRemove.get(i));
            }
        }
    }

    private record Job(ConferenceSchedule schedule, LocalDateTime createdAt, Throwable exception) {

        static Job ofSchedule(ConferenceSchedule schedule) {
            return new Job(schedule, LocalDateTime.now(), null);
        }

        static Job ofException(Throwable error) {
            return new Job(null, LocalDateTime.now(), error);
        }
    }
}
