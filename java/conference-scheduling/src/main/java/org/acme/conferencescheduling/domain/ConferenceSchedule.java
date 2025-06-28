package org.acme.conferencescheduling.domain;

import java.util.Set;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.ProblemFactProperty;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.solver.SolverStatus;

@PlanningSolution
public class ConferenceSchedule {

    private String name;

    @ProblemFactProperty
    private ConferenceConstraintProperties constraintProperties;

    @ProblemFactCollectionProperty
    private Set<TalkType> talkTypes;

    @ProblemFactCollectionProperty
    private Set<Timeslot> timeslots;

    @ProblemFactCollectionProperty
    private Set<Room> rooms;

    @ProblemFactCollectionProperty
    private Set<Speaker> speakers;

    @PlanningEntityCollectionProperty
    private Set<Talk> talks;

    @PlanningScore
    private HardSoftScore score = null;

    // Ignored by Timefold, used by the UI to display solve or stop solving button
    private SolverStatus solverStatus;

    public ConferenceSchedule() {
    }

    public ConferenceSchedule(String name, HardSoftScore score, SolverStatus solverStatus) {
        this.name = name;
        this.score = score;
        this.solverStatus = solverStatus;
    }

    public ConferenceSchedule(String name, Set<TalkType> talkTypes, Set<Timeslot> timeslots, Set<Room> rooms,
            Set<Speaker> speakers, Set<Talk> talks) {
        this.name = name;
        this.talkTypes = talkTypes;
        this.timeslots = timeslots;
        this.rooms = rooms;
        this.speakers = speakers;
        this.talks = talks;
    }

    // ************************************************************************
    // Simple getters and setters
    // ************************************************************************

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ConferenceConstraintProperties getConstraintProperties() {
        return constraintProperties;
    }

    public void setConstraintProperties(ConferenceConstraintProperties constraintProperties) {
        this.constraintProperties = constraintProperties;
    }

    public Set<TalkType> getTalkTypes() {
        return talkTypes;
    }

    public void setTalkTypes(Set<TalkType> talkTypes) {
        this.talkTypes = talkTypes;
    }

    public Set<Timeslot> getTimeslots() {
        return timeslots;
    }

    public void setTimeslots(Set<Timeslot> timeslots) {
        this.timeslots = timeslots;
    }

    public Set<Room> getRooms() {
        return rooms;
    }

    public void setRooms(Set<Room> rooms) {
        this.rooms = rooms;
    }

    public Set<Speaker> getSpeakers() {
        return speakers;
    }

    public void setSpeakers(Set<Speaker> speakers) {
        this.speakers = speakers;
    }

    public Set<Talk> getTalks() {
        return talks;
    }

    public void setTalks(Set<Talk> talks) {
        this.talks = talks;
    }

    public HardSoftScore getScore() {
        return score;
    }

    public void setScore(HardSoftScore score) {
        this.score = score;
    }

    public SolverStatus getSolverStatus() {
        return solverStatus;
    }

    public void setSolverStatus(SolverStatus solverStatus) {
        this.solverStatus = solverStatus;
    }

    @Override
    public String toString() {
        return name;
    }
}
