from decimal import Decimal
from sqlalchemy import DECIMAL, DateTime, ForeignKey, func
from .base import Base

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import uuid4, UUID

from sqlalchemy import UUID as DB_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from .machine import Machine
    from .semester import Semester
    from .user import User
    from .resource_usage_quantity import ResourceUsageQuantity


class MachineUsage(Base):
    __tablename__ = "machine_usages"

    id: Mapped[UUID] = mapped_column(
        DB_UUID(as_uuid=True), primary_key=True, default=uuid4
    )

    machine_id: Mapped[UUID] = mapped_column(ForeignKey("machines.id"))
    machine: Mapped["Machine"] = relationship(
        back_populates="active_usage", foreign_keys=[machine_id]
    )

    semester_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("semesters.id"))
    semester: Mapped[Optional["Semester"]] = relationship()

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", name="fk_used_by"))
    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    time_started: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    duration_seconds: Mapped[int]

    # Did usage fail?
    failed: Mapped[bool] = mapped_column(default=False)
    # Timezone-aware, so it serialises with an offset and clients read it as
    # the instant it was, not as their own local time.
    failed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    is_reprint: Mapped[bool] = mapped_column(default=False, server_default="false")

    # The failed usage this reprint replaces. Required to enforce the reprint
    # policy: without it there is no way to tell whether a failure has already
    # been reprinted, or how much material the failed print actually used.
    reprint_of_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("machine_usages.id", name="fk_reprint_of"), nullable=True
    )
    reprint_of: Mapped[Optional["MachineUsage"]] = relationship(
        remote_side="MachineUsage.id", foreign_keys=[reprint_of_id]
    )

    cost: Mapped[Decimal] = mapped_column(DECIMAL(precision=10, scale=5))

    resources_used: Mapped[list["ResourceUsageQuantity"]] = relationship(
        back_populates="machine_usage", cascade="all, delete"
    )
