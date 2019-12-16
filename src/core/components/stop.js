'use strict'

const defer = require('p-defer')
const { NotStartedError, AlreadyInitializedError } = require('../errors')
const Commands = require('./')

module.exports = ({
  apiManager,
  constructorOptions,
  bitswap,
  blockService,
  gcLock,
  initOptions,
  ipld,
  ipns,
  keychain,
  libp2p,
  peerInfo,
  pinManager,
  preload,
  print,
  repo
}) => async function stop () {
  const stopPromise = defer()
  const { cancel } = apiManager.update({ stop: () => stopPromise.promise })

  try {
    blockService.unsetExchange()
    bitswap.stop()
    preload.stop()

    await Promise.all([
      ipns.republisher.stop(),
      // mfsPreload.stop(),
      libp2p.stop(),
      repo.close()
    ])

    const api = createApi({
      apiManager,
      constructorOptions,
      blockService,
      gcLock,
      initOptions,
      ipld,
      keychain,
      peerInfo,
      pinManager,
      preload,
      print,
      repo
    })

    apiManager.update(api, () => { throw new NotStartedError() })
  } catch (err) {
    cancel()
    stopPromise.reject(err)
    throw err
  }

  stopPromise.resolve(apiManager.api)
  return apiManager.api
}

function createApi ({
  apiManager,
  constructorOptions,
  blockService,
  gcLock,
  initOptions,
  ipld,
  keychain,
  peerInfo,
  pinManager,
  preload,
  print,
  repo
}) {
  const dag = {
    get: Commands.dag.get({ ipld, preload }),
    resolve: Commands.dag.resolve({ ipld, preload }),
    tree: Commands.dag.tree({ ipld, preload })
  }
  const object = Commands.legacy.object({ _ipld: ipld, _preload: preload, dag, _gcLock: gcLock })
  const pin = {
    add: Commands.pin.add({ pinManager, gcLock, dag, object }),
    ls: Commands.pin.ls({ pinManager, object }),
    rm: Commands.pin.rm({ pinManager, gcLock, object })
  }
  // FIXME: resolve this circular dependency
  dag.put = Commands.dag.put({ ipld, pin, gcLock, preload })
  const add = Commands.add({ ipld, dag, preload, pin, gcLock, constructorOptions })

  const start = Commands.start({
    apiManager,
    constructorOptions,
    blockService,
    gcLock,
    initOptions,
    ipld,
    keychain,
    peerInfo,
    pinManager,
    preload,
    print,
    repo
  })

  const api = {
    add,
    block: {
      get: Commands.block.get({ blockService, preload }),
      put: Commands.block.put({ blockService, gcLock, preload }),
      rm: Commands.block.rm({ blockService, gcLock, pinManager }),
      stat: Commands.block.stat({ blockService, preload })
    },
    config: Commands.config({ repo }),
    init: () => { throw new AlreadyInitializedError() },
    pin,
    start,
    stop: () => apiManager.api
  }

  return api
}