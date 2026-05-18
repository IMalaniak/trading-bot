use rdkafka::message::{Header, Headers, OwnedHeaders};

pub mod header_names {
    pub const EVENT_ID: &str = "event-id";
    pub const EVENT_TYPE: &str = "event-type";
    pub const SCHEMA_VERSION: &str = "schema-version";
    pub const OCCURRED_AT: &str = "occurred-at";
    pub const PRODUCER: &str = "producer";
    pub const CONTENT_TYPE: &str = "content-type";
    pub const CORRELATION_ID: &str = "correlation-id";
    pub const CAUSATION_ID: &str = "causation-id";
    pub const TRACEPARENT: &str = "traceparent";
}

pub mod content_types {
    pub const PROTOBUF: &str = "application/x-protobuf";
}

pub mod producers {
    pub const PORTFOLIO_MANAGER: &str = "portfolio-manager";
    pub const PREDICTION_ENGINE: &str = "prediction-engine";
    pub const FEATURE_ENGINEERING: &str = "feature-engineering";
    pub const EXECUTION_ENGINE: &str = "execution-engine";
    pub const EXTERNAL_API_FACADE: &str = "external-api-facade";
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventMetadataHeadersInput<'a> {
    pub event_id: &'a str,
    pub event_type: &'a str,
    pub schema_version: &'a str,
    pub occurred_at: &'a str,
    pub producer: &'a str,
    pub content_type: Option<&'a str>,
    pub correlation_id: Option<&'a str>,
    pub causation_id: Option<&'a str>,
    pub traceparent: Option<&'a str>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventContext {
    pub event_id: Option<String>,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub traceparent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChildEventContext {
    pub correlation_id: String,
    pub causation_id: Option<String>,
    pub traceparent: Option<String>,
}

pub fn build_event_metadata_headers(input: EventMetadataHeadersInput<'_>) -> OwnedHeaders {
    let correlation_id = input.correlation_id.unwrap_or(input.event_id);
    let content_type = input.content_type.unwrap_or(content_types::PROTOBUF);

    let mut headers = OwnedHeaders::new_with_capacity(8)
        .insert(Header {
            key: header_names::EVENT_ID,
            value: Some(input.event_id),
        })
        .insert(Header {
            key: header_names::EVENT_TYPE,
            value: Some(input.event_type),
        })
        .insert(Header {
            key: header_names::SCHEMA_VERSION,
            value: Some(input.schema_version),
        })
        .insert(Header {
            key: header_names::OCCURRED_AT,
            value: Some(input.occurred_at),
        })
        .insert(Header {
            key: header_names::PRODUCER,
            value: Some(input.producer),
        })
        .insert(Header {
            key: header_names::CONTENT_TYPE,
            value: Some(content_type),
        })
        .insert(Header {
            key: header_names::CORRELATION_ID,
            value: Some(correlation_id),
        });

    if let Some(causation_id) = input.causation_id {
        headers = headers.insert(Header {
            key: header_names::CAUSATION_ID,
            value: Some(causation_id),
        });
    }

    if let Some(traceparent) = input.traceparent {
        headers = headers.insert(Header {
            key: header_names::TRACEPARENT,
            value: Some(traceparent),
        });
    }

    headers
}

pub fn read_header<H: Headers>(headers: Option<&H>, name: &str) -> Option<String> {
    headers.and_then(|headers| {
        headers.iter().find_map(|header| {
            if header.key != name {
                return None;
            }

            header
                .value
                .and_then(|value| std::str::from_utf8(value).ok())
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
    })
}

pub fn resolve_event_context<H: Headers>(
    headers: Option<&H>,
    fallback_event_id: Option<&str>,
) -> EventContext {
    let event_id = read_header(headers, header_names::EVENT_ID);
    let correlation_id = read_header(headers, header_names::CORRELATION_ID)
        .or_else(|| event_id.clone())
        .or_else(|| fallback_event_id.map(ToOwned::to_owned));

    EventContext {
        event_id,
        correlation_id,
        causation_id: read_header(headers, header_names::CAUSATION_ID),
        traceparent: read_header(headers, header_names::TRACEPARENT),
    }
}

pub fn child_event_context(parent: Option<&EventContext>, event_id: &str) -> ChildEventContext {
    let correlation_id = parent
        .and_then(|ctx| ctx.correlation_id.clone().or_else(|| ctx.event_id.clone()))
        .unwrap_or_else(|| event_id.to_owned());

    ChildEventContext {
        correlation_id,
        causation_id: parent.and_then(|ctx| ctx.event_id.clone()),
        traceparent: parent.and_then(|ctx| ctx.traceparent.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kafka::{topics, topics::schema_versions};

    #[test]
    fn builds_standard_metadata_headers() {
        let headers = build_event_metadata_headers(EventMetadataHeadersInput {
            event_id: "feature-event-1",
            event_type: topics::FEATURES_INDICATORS,
            schema_version: schema_versions::FEATURES_INDICATORS,
            occurred_at: "2026-03-22T12:34:56.789Z",
            producer: producers::FEATURE_ENGINEERING,
            content_type: None,
            correlation_id: Some("workflow-1"),
            causation_id: Some("market-event-1"),
            traceparent: Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"),
        });

        let borrowed = headers.as_borrowed();
        assert_eq!(
            read_header(Some(borrowed), header_names::EVENT_ID).as_deref(),
            Some("feature-event-1")
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::EVENT_TYPE).as_deref(),
            Some(topics::FEATURES_INDICATORS)
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::SCHEMA_VERSION).as_deref(),
            Some(schema_versions::FEATURES_INDICATORS)
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::PRODUCER).as_deref(),
            Some(producers::FEATURE_ENGINEERING)
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::CONTENT_TYPE).as_deref(),
            Some(content_types::PROTOBUF)
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::CORRELATION_ID).as_deref(),
            Some("workflow-1")
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::CAUSATION_ID).as_deref(),
            Some("market-event-1")
        );
        assert_eq!(
            read_header(Some(borrowed), header_names::TRACEPARENT).as_deref(),
            Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00")
        );
    }

    #[test]
    fn resolves_and_derives_event_context() {
        let headers = build_event_metadata_headers(EventMetadataHeadersInput {
            event_id: "market-event-1",
            event_type: topics::MARKET_RAW_DATA,
            schema_version: schema_versions::MARKET_RAW_DATA,
            occurred_at: "2026-03-22T12:34:56.789Z",
            producer: producers::EXTERNAL_API_FACADE,
            content_type: None,
            correlation_id: Some("workflow-1"),
            causation_id: None,
            traceparent: Some("trace-1"),
        });

        let context = resolve_event_context(Some(headers.as_borrowed()), Some("fallback-1"));
        assert_eq!(context.event_id.as_deref(), Some("market-event-1"));
        assert_eq!(context.correlation_id.as_deref(), Some("workflow-1"));
        assert_eq!(context.causation_id, None);
        assert_eq!(context.traceparent.as_deref(), Some("trace-1"));

        let child = child_event_context(Some(&context), "feature-event-1");
        assert_eq!(child.correlation_id, "workflow-1");
        assert_eq!(child.causation_id.as_deref(), Some("market-event-1"));
        assert_eq!(child.traceparent.as_deref(), Some("trace-1"));
    }

    #[test]
    fn falls_back_to_current_event_for_missing_correlation() {
        let headers = OwnedHeaders::new().insert(Header {
            key: header_names::EVENT_ID,
            value: Some("event-1"),
        });

        let context = resolve_event_context(Some(headers.as_borrowed()), Some("fallback-1"));
        assert_eq!(context.correlation_id.as_deref(), Some("event-1"));
    }
}
