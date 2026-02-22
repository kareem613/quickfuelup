import type { ReactNode } from 'react'
import type { Vehicle } from '../../lib/types'

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
  return (
    <div className={`card stack${props.stepDone && !props.open ? ' collapsed' : ''}`}>
      <button className="row card-header-btn" type="button" onClick={props.onToggle}>
        <strong>1) Select vehicle</strong>
        {props.stepDone ? props.doneIcon : <span className="muted">Required</span>}
      </button>
      {props.stepDone && !props.open ? null : props.busy ? (
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
    </div>
  )
}

