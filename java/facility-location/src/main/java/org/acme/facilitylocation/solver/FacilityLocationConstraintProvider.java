package org.acme.facilitylocation.solver;

import static ai.timefold.solver.core.api.score.buildin.hardsoftlong.HardSoftLongScore.ONE_HARD;
import static ai.timefold.solver.core.api.score.stream.ConstraintCollectors.sumLong;

import ai.timefold.solver.core.api.score.buildin.hardsoftlong.HardSoftLongScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;

import org.acme.facilitylocation.domain.Consumer;
import org.acme.facilitylocation.domain.Facility;

public class FacilityLocationConstraintProvider implements ConstraintProvider {

    @Override
    public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
        return new Constraint[] {
                facilityCapacity(constraintFactory),
                setupCost(constraintFactory),
                distanceFromFacility(constraintFactory)
        };
    }

    Constraint facilityCapacity(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(Consumer.class)
                .groupBy(Consumer::getFacility, sumLong(Consumer::getDemand))
                .filter((facility, demand) -> demand > facility.getCapacity())
                .penalizeLong(ONE_HARD, (facility, demand) -> demand - facility.getCapacity())
                .asConstraint("facility capacity");
    }

    Constraint setupCost(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(Consumer.class)
                .groupBy(Consumer::getFacility)
                .penalizeLong(HardSoftLongScore.ofSoft(2), Facility::getSetupCost)
                .asConstraint("facility setup cost");
    }

    Constraint distanceFromFacility(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(Consumer.class)
                .filter(Consumer::isAssigned)
                .penalizeLong(HardSoftLongScore.ofSoft(5), Consumer::distanceFromFacility)
                .asConstraint("distance from facility");
    }
}
