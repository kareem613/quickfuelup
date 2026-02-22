import type { ReactNode } from 'react'
import type { Vehicle } from '../../lib/types'
import { CollapsibleCard } from '../../components/ui/CollapsibleCard'

export function VehicleSelectStep(props: {
  stepDone: boolean
  open: boolean
  busy: boolean
  submitBusy: boolean
  vehicles: Vehicle[]
  selectedVehicleId: number | undefined
  onToggle: () => void
  onSelectVehicle: (vehicleId: number) => void
  splitVehicleName: (name: string) => { year?: string; model: string }
  doneIcon: ReactNode
}) {
  const title = <strong>1) Select vehicle</strong>
  const right = props.stepDone ? props.doneIcon : <span className="muted">Required</span>
  return (
    <CollapsibleCard title={title} open={props.open || !props.stepDone} onToggle={props.onToggle} right={right}>
      {props.busy ? (
        <div className="muted">Loading vehicles…</div>
      ) : (
        <div className="vehicle-grid">
          {props.vehicles.map((v) => {
            const selected = props.selectedVehicleId === v.id
            return (
              <button
                key={v.id}
                className={`vehicle-card${selected ? ' selected' : ''}`}
                onClick={() => props.onSelectVehicle(v.id)}
                disabled={props.submitBusy}
                type="button"
              >
                {(() => {
                  const parts = props.splitVehicleName(v.name)
                  return (
                    <div className="vehicle-name">
                      {parts.year ? <div className="vehicle-year">{parts.year}</div> : null}
                      <div className="vehicle-model">{parts.model}</div>
                    </div>
                  )
                })()}
              </button>
            )
          })}
        </div>
      )}
    </CollapsibleCard>
  )
}
