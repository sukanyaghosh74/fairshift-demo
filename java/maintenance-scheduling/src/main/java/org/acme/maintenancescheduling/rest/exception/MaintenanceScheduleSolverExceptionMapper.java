package org.acme.maintenancescheduling.rest.exception;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

@Provider
public class MaintenanceScheduleSolverExceptionMapper implements ExceptionMapper<MaintenanceScheduleSolverException> {

    @Override
    public Response toResponse(MaintenanceScheduleSolverException exception) {
        return Response
                .status(exception.getStatus())
                .type(MediaType.APPLICATION_JSON)
                .entity(new ErrorInfo(exception.getJobId(), exception.getMessage()))
                .build();
    }
}
