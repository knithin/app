import {
  Injectable,
  NgZone,
}                   from '@angular/core'
import { Storage }  from '@ionic/storage'
// import { Http }    from '@angular/http'

import {
  AuthHttp,
  JwtHelper,
  tokenNotExpired,
}                   from 'angular2-jwt'
import Auth0        from 'auth0-js'
import Auth0Lock    from 'auth0-lock'

import { Brolog }   from 'brolog'
import {
  // BehaviorSubject,
  Observable,
  Subscription,
}                   from 'rxjs'
import              'rxjs/add/operator/map'

/**
 * User Profile: https://auth0.com/docs/user-profile
 * Structure of the User Profile: https://auth0.com/docs/user-profile/user-profile-structure
 * Control the contents of an ID token: https://auth0.com/docs/tokens/id-token#control-the-contents-of-an-id-token
 * OpenID Connect Standard Claims: https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
 */
export type User = {
  account:  string,
  email:    string,
  name:     string,
  picture?: string,

  profile?: object,
}

const STORAGE_KEY = {
  ACCESS_TOKEN:   'access_token',
  ID_TOKEN:       'id_token',
  USER_PROFILE:        'profile',

  /**
   * OIDC-conformant refresh tokens: https://auth0.com/docs/api-auth/tutorials/adoption/refresh-tokens
   * Silent Authentication: https://auth0.com/docs/api-auth/tutorials/silent-authentication
   */
  REFRESH_TOKEN:  'refresh_token',
}

/**
 * Auth0 API Configuration
 */
const AUTH0 = {
  CLIENT_ID:  'kW2jmKVAO6xMY9H4fYPUtFJSSRJbe3sz',
  DOMAIN:     'zixia.auth0.com',
}

@Injectable()
export class Auth {
  userProfile: Object | null

  jwtHelper = new JwtHelper()
  storage   = new Storage()

  refreshSubscription: Subscription
  accessToken:  string | null
  idToken:      string | null

  // Configure Auth0
  auth0WebAuth = new Auth0.WebAuth({
    clientID: AUTH0.CLIENT_ID,
    domain:   AUTH0.DOMAIN,
  })

  /**
   * Lock Configurable Options: https://auth0.com/docs/libraries/lock/v10/customization
   */
  auth0Lock = new Auth0Lock(
    AUTH0.CLIENT_ID,
    AUTH0.DOMAIN,
    {
      languageDictionary: {
        title: 'Chatie',
      },
      /**
       * Lock: Authentication Parameters
       *  - https://auth0.com/docs/libraries/lock/v10/sending-authentication-parameters#supported-parameters
       */
      auth: {
        params: {
          // scope: 'openid profile user_metadata app_metadata email offline_access ', // offline_access for refreshToken(?)
          scope: 'openid email offline_access', // offline_access for refreshToken(?)
        },
        redirect: false,  // must use popup for ionic2
        responseType: 'id_token token', // token for `accessToken`
      },
      allowSignUp: false,
      // allowedConnections: ['github'],
      initialScreen: 'login',
      // usernameStyle: 'email',
      socialButtonStyle: 'big',
      mustAcceptTerms:   true,
      rememberLastLogin: true,
      autofocus: true,
      autoclose: false,
      theme: {
        logo: 'https://avatars2.githubusercontent.com/u/25162437?v=3&s=200',
        primaryColor: '#32db64',
      },
    },
  )

  constructor(
    public authHttp:  AuthHttp,
    public log:       Brolog,
    public ngZone:    NgZone,
  ) {
    this.log.verbose('Auth', 'constructor()')

    this.init()
  }

  private async init(): Promise<void> {
    this.log.verbose('Auth', 'init()')

    try {
      this.idToken  = await this.storage.get(STORAGE_KEY.ID_TOKEN)
      this.userProfile     = await this.storage.get(STORAGE_KEY.USER_PROFILE)

      this.log.silly('Auth', 'init() Storage.get(profile)=%s', JSON.stringify(this.userProfile))

      // this.user = JSON.parse(profile)
      // this.user = profile
    } catch (e) {
      this.log.error('Auth', 'init() exception: %s', e.message)
    }

  }

    /*
    https://github.com/auth0/lock/issues/541

        authenticated$ = Observable
        .fromEvent(this.authService.authLock, 'authenticated')
        .do((authResult: any) => {
            localStorage.setItem('id_token', authResult.idToken);
        })
        .map(()=>new auth.LoginSuccessAction({}));

getProfile(idToken: string): Observable<any>{
        return new Observable(observer => {
            this.lock.getProfile(idToken, (err, profile) => {
            if (err) {
                observer.error(err);
            }
            else {
                console.log(profile);
                observer.next(profile);
                observer.complete();
            }
            });
        });
    }
    */

  /**
   *
   *
   * @returns {Promise<boolean>}
   */
  public async login(): Promise<boolean> {
    this.log.verbose('Auth', 'login()')

    return new Promise<boolean>((resolve, reject) => {
      // Add callback for lock `authenticated` event
      this.auth0Lock.on('authenticated', (authResult) => {
        this.log.verbose('Auth', 'login() on(authenticated, %s)',
                                  Object.keys(authResult).join(','),
                        )

        this.accessToken  = authResult.accessToken
        this.idToken      = authResult.idToken

        if (!this.idToken) {
          const e = new Error('no idToken')
          this.log.error('Auth', 'login() on(authenticated) error:%s', e.message)
          return reject(e)
        }

        this.auth0Lock.getProfile(this.idToken, (error, profile) => {
          this.log.verbose('Auth', 'login() Auth0Lock.getProfile() profile:%s', JSON.stringify(profile))

          if (error) {
            // Handle error
            this.log.warn('Auth', 'login() Auth0Lock.getProfile() error:%s', error)
            return reject(error)
          }

          this.userProfile = profile

          this.storage.ready().then(() => {
            this.storage.set(STORAGE_KEY.ACCESS_TOKEN,  authResult.accessToken)
            this.storage.set(STORAGE_KEY.ID_TOKEN,      authResult.idToken)
            this.storage.set(STORAGE_KEY.REFRESH_TOKEN, authResult.refreshToken)

            this.storage.set(STORAGE_KEY.USER_PROFILE,  profile)
          })

          this.scheduleRefresh()

          /**
           * Resolve
           */
          this.auth0Lock.hide()
          return resolve(true)

        })
      })

      this.auth0Lock.on('unrecoverable_error', error => {
        this.log.verbose('Auth', 'login() on(unrecoverable_error)')
        return resolve(false)
      })

      this.auth0Lock.on('authorization_error', error => {
        this.log.verbose('Auth', 'login() on(authorization_error)')
        return resolve(false)
      })

      // Call the show method to display the widget.
      this.auth0Lock.show()
    })
  }

  public logout(): void {
    this.log.verbose('Auth', 'logout()')

    // Remove token from localStorage
    this.storage.remove(STORAGE_KEY.ACCESS_TOKEN)
    this.storage.remove(STORAGE_KEY.ID_TOKEN)
    this.storage.remove(STORAGE_KEY.REFRESH_TOKEN)

    this.storage.remove(STORAGE_KEY.USER_PROFILE)

    this.accessToken  = null
    this.idToken      = null
    this.userProfile  = null

    // Unschedule the token refresh
    this.unscheduleRefresh()
  }

  public authenticated(): boolean {
    // Check if there's an unexpired JWT
    // It searches for an item in localStorage with key == 'id_token'
    // return tokenNotExpired()
    const valid = !!this.idToken && tokenNotExpired(STORAGE_KEY.ID_TOKEN, this.idToken)
    this.log.verbose('Auth', 'authenticated(): %s', valid)

    return valid
  }

  public scheduleRefresh() {
    this.log.verbose('Auth', 'scheduleRefresh()')

    // If the user is authenticated, use the token stream
    // provided by angular2-jwt and flatMap the token

    if (!this.idToken) {
      this.log.error('Auth', 'scheduleRefresh() error: no this.idToken')
      return
    }
    let source = Observable.of(this.idToken).flatMap(token => {
      this.log.verbose('Auth', 'scheduleRefresh() for token:%s', token)

      if (!token) {
        const e = new Error('scheduleRefresh() failed to get token')
        this.log.error('Auth', e.message)
        throw e
      }

      // The delay to generate in this case is the difference
      // between the expiry time and the issued at time
      let jwtIat = this.jwtHelper.decodeToken(token).iat
      let jwtExp = this.jwtHelper.decodeToken(token).exp
      let iat = new Date(0)
      let exp = new Date(0)

      let delay = (exp.setUTCSeconds(jwtExp) - iat.setUTCSeconds(jwtIat));

      return Observable.interval(delay)
    })

    this.refreshSubscription = source.subscribe(() => {
      this.getNewJwt();
    })
  }

  public startupTokenRefresh() {
    this.log.verbose('Auth', 'startupTokenRefresh()')

    // If the user is authenticated, use the token stream
    // provided by angular2-jwt and flatMap the token
    if (this.authenticated()) {
      let source = this.authHttp.tokenStream.flatMap(
        token => {
          // Get the expiry time to generate
          // a delay in milliseconds
          let now: number = new Date().valueOf()
          let jwtExp: number = this.jwtHelper.decodeToken(token).exp
          let exp: Date = new Date(0)
          exp.setUTCSeconds(jwtExp)
          let delay: number = exp.valueOf() - now

          // Use the delay in a timer to
          // run the refresh at the proper time
          return Observable.timer(delay)
        })

        // Once the delay time from above is
        // reached, get a new JWT and schedule
        // additional refreshes
        source.subscribe(() => {
          this.getNewJwt()
          this.scheduleRefresh()
        })
    }
  }

  public unscheduleRefresh() {
    this.log.verbose('Auth', 'unscheduleRefresh()')

    // Unsubscribe fromt the refresh
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe()
    }
  }

  public async getNewJwt() {
    this.log.verbose('Auth', 'getNewJwt()')

    // Get a new JWT from Auth0 using the refresh token saved
    // in local storage
    try {
      /**
       * Token Lifetime: https://auth0.com/docs/tokens/id-token#token-lifetime
       */
      this.auth0WebAuth.renewAuth({
        // ???
        // https://github.com/auth0/auth0.js/blob/master/example/index.html
        // https://auth0.com/docs/libraries/auth0js/v8#using-renewauth-to-acquire-new-tokens
        // https://auth0.com/forum/t/remember-me-in-authservice-using-auth0-js-v8/5037
        //
        // audience: 'https://example.com/api/v2',
        // scope: 'read:something write:otherthing',

        // Hosted Login Page: https://auth0.com/docs/hosted-pages/login
        // redirectUri: 'https://zixia.auth0.com/login?client=g6P417oEmHON1BuPdsV9foNgP4h98dmh',
        usePostMessage: true,
      }, (err, authResult) => {
        if (err) {
          this.log.error('Auth', 'getNewJwt() WebAuth.renewAuth() error: %s', err)
          return
        }
        this.storage.set(STORAGE_KEY.ACCESS_TOKEN,  authResult.accessToken)
        this.storage.set(STORAGE_KEY.ID_TOKEN,      authResult.idToken)
        this.storage.set(STORAGE_KEY.REFRESH_TOKEN, authResult.refreshToken)

        this.accessToken  = authResult.accessToken
        this.idToken      = authResult.idToken
      })
    } catch (e) {
      this.log.error('Auth', 'getNewJwt() error: %s', e.message)
    }
  }

}
