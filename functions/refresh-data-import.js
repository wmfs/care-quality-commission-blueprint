const cloneDeep = require('lodash.clonedeep')
const dottie = require('dottie')
const csvparse = require('csv-parse')
const fs = require('fs')
const path = require('path')

function readCsv (filepath, rows) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(csvparse({ columns: true }))
      .on('data', row => {
        const r = {}
        for (const [k, v] of Object.entries(row)) { if (v !== null && v !== undefined && v !== '') r[k] = v }
        rows.push(r)
      })
      .on('error', reject)
      .on('end', resolve)
  })
}

module.exports = function () {
  return async function refreshDataImport (event, env, context) {
    const {
      models,
      client
    } = env.bootedServices.storage

    const {
      cqc_importLog: logModel,
      cqc_cqc: cqcModel
    } = models

    const {
      serverFilename,
      clientFilename,
      totalRows,
      importDirectory
    } = event

    if (
      !isAccessible(importDirectory) ||
      !fs.statSync(importDirectory).isDirectory()
    ) {
      return
    }

    const importLog = {
      serverFilename,
      clientFilename,
      totalRows,
      startTime: new Date(),
      totalRowsInserted: 0,
      progress: 0,
      complete: false
    }

    const importLogDoc = await logModel.create(importLog)
    importLog.id = importLogDoc.idProperties.id

    await client.query('TRUNCATE TABLE cqc.cqc;')

    const rows = []

    const csvFileName = path.basename(clientFilename, '.ods') + '.csv'
    await readCsv(path.join(importDirectory, csvFileName), rows)

    for (const row of rows) {
      await cqcModel.create(row)
      importLog.totalRowsInserted++

      // report every 250 rows
      const c = importLog.totalRowsInserted
      if (Math.trunc(c / 250) === (c / 250) && c < importLog.totalRows) {
        await progress(importLog, false, event, env, context)
        await logModel.update(importLog, {})
      }
    }

    importLog.endTime = new Date()

    await progress(importLog, true, event, env, context)
    await logModel.update(importLog, {})

    return event
  }
}

async function progress (importLog, complete, event, env, context) {
  let parentExecutionName, parentResultPath

  if (event.launcher) {
    parentExecutionName = event.launcher.executionName
    parentResultPath = event.launcher.callbackPath
  }

  if (parentExecutionName) {
    importLog.complete = complete
    importLog.progress = importLog.totalRowsInserted / importLog.totalRows
    const { statebox } = env.bootedServices
    const executionOptions = cloneDeep(context.executionOptions)
    const updateEvent = complete ? 'sendTaskLastHeartbeat' : 'sendTaskHeartbeat'
    const shaped = {}
    dottie.set(shaped, parentResultPath, importLog)

    try {
      await statebox[updateEvent](parentExecutionName, shaped, executionOptions)
    } catch (err) {
      console.log('Error progressing', err)
      // ignore failures, but don't let them
      // propagate so we don't bring down the
      // whole state machine
    }
  }
}

function isAccessible (importDirectory) {
  try {
    fs.accessSync(importDirectory, fs.constants.R_OK)
    return true
  } catch (e) {
    return false
  }
} // isAccessible
