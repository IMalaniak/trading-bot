from __future__ import annotations

from typing import Protocol


class ProtobufMessage(Protocol):
    def SerializeToString(self) -> bytes: ...

    def ParseFromString(self, payload: bytes) -> int: ...


def serialize_message(message: ProtobufMessage) -> bytes:
    return message.SerializeToString()


def parse_message[T: ProtobufMessage](message: T, payload: bytes) -> T:
    message.ParseFromString(payload)
    return message
