
import os
import uuid
from contextvars import ContextVar
from typing import Optional
from ..logger import logger

correlation_id_var: ContextVar[Optional[str]] = ContextVar('correlation_id', default=None)

OTEL_ENABLED = os.getenv("OTEL_ENABLED", "true").lower() == "true"
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "hmd-backend")

_tracer = None
_initialized = False

def init_tracing(app):
    global _tracer, _initialized

    if not OTEL_ENABLED:
        logger.info("OpenTelemetry tracing is disabled (OTEL_ENABLED=false)")
        return

    if _initialized:
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME as RESOURCE_SERVICE_NAME
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

            otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")

            resource = Resource.create({RESOURCE_SERVICE_NAME: SERVICE_NAME})

            provider = TracerProvider(resource=resource)

            otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint, insecure=True)
            provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

            trace.set_tracer_provider(provider)

            logger.success(f"OpenTelemetry tracing initialized with OTLP exporter ({otlp_endpoint})")

        except ImportError:
                                                                               
            from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

            resource = Resource.create({RESOURCE_SERVICE_NAME: SERVICE_NAME})

            provider = TracerProvider(resource=resource)
            provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
            trace.set_tracer_provider(provider)

            logger.info("OpenTelemetry tracing initialized with console exporter (OTLP not available)")

        FastAPIInstrumentor.instrument_app(app)

        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            from ..database.engine import engine
            SQLAlchemyInstrumentor().instrument(engine=engine)
            logger.info("SQLAlchemy instrumented for tracing")
        except Exception as e:
            logger.warning(f"Failed to instrument SQLAlchemy for tracing: {e}")

        _tracer = trace.get_tracer(__name__)
        _initialized = True

    except ImportError as e:
        logger.warning(f"OpenTelemetry packages not installed: {e}. Tracing disabled.")
    except Exception as e:
        logger.error(f"Failed to initialize OpenTelemetry tracing: {e}")

def get_tracer():
    return _tracer

def generate_correlation_id() -> str:
    return str(uuid.uuid4())

def get_correlation_id() -> Optional[str]:
    return correlation_id_var.get()

def set_correlation_id(correlation_id: str) -> None:
    correlation_id_var.set(correlation_id)

class CorrelationIdMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        correlation_id = headers.get(b"x-correlation-id", b"").decode("utf-8")

        if not correlation_id:
            correlation_id = generate_correlation_id()

        set_correlation_id(correlation_id)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-correlation-id", correlation_id.encode("utf-8")))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)

def trace_span(name: str):
    def decorator(func):
        if _tracer is None:
            return func

        async def async_wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(name) as span:
                correlation_id = get_correlation_id()
                if correlation_id:
                    span.set_attribute("correlation_id", correlation_id)
                return await func(*args, **kwargs)

        def sync_wrapper(*args, **kwargs):
            with _tracer.start_as_current_span(name) as span:
                correlation_id = get_correlation_id()
                if correlation_id:
                    span.set_attribute("correlation_id", correlation_id)
                return func(*args, **kwargs)

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
