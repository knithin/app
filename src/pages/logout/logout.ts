import { Component }  from '@angular/core'
import {
  Auth,
  Push,
}                     from '@ionic/cloud-angular'
import {
  Loading,
  LoadingController,
  NavController,
  NavParams,
}                     from 'ionic-angular'

import { Brolog }     from 'brolog'

import { LoginPage }  from '../login/'

@Component({
  selector:     'page-logout',
  templateUrl:  'logout.html',
})
export class LogoutPage {
  loading: Loading | null = null

  constructor(
    public auth:        Auth,
    public loadingCtrl: LoadingController,
    public log:         Brolog,
    public navCtrl:     NavController,
    public navParams:   NavParams,
    public push:        Push,
  ) {
    this.log.verbose('LogoutPage', 'constructor()')
  }

  ionViewDidLoad() {
    this.log.verbose('LogoutPage', 'ionViewDidLoad()')
  }

  showLoader(): void {
    this.log.verbose('LogoutPage', 'showLoader()')

    this.loading = this.loadingCtrl.create({
      content: 'Loading...',
    })
    this.loading.present()
  }

  hideLoader(): void {
    this.log.verbose('LogoutPage', 'hideLoader()')

    if (!this.loading) {
      return
    }
    this.loading.dismissAll()
    this.loading = null
  }

  async logout() {
    this.log.verbose('LogoutPage', 'logout()')

    this.showLoader()
    await this.push.unregister()
    this.auth.logout()
    this.navCtrl.setRoot(LoginPage)
    this.hideLoader()
  }

}
