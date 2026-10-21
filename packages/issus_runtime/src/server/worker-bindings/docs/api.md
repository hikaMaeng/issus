# api

createWorkerReadiness(BindingOptions) → {initialize(database:Pool):Promise<void>, ready(database:Pool):Promise<void>}. 하나라도 준비되지 않으면 reject한다. 기존 createWorkerBindings/reactionCoordinates 공개 경계는 유지한다.
