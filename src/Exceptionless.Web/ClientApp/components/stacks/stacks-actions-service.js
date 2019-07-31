﻿(function () {
  'use strict';

  angular.module('exceptionless.stacks')
    .factory('stacksActionsService', function ($ExceptionlessClient, dialogService, stackDialogService, stackService, notificationService, translateService, $q) {
      var source = 'exceptionless.stacks.stacksActionsService';

      function executeAction(ids, action, onSuccess, onFailure) {
        var deferred = $q.defer();
        var promise = _.chunk(ids, 10).reduce(function (previous, item) {
          return previous.then(action(item.join(',')));
        }, deferred.promise).then(onSuccess, onFailure);

        deferred.resolve();
        return promise;
      }

      var deleteAction = {
        name: 'Delete',
        run: function (ids) {
          $ExceptionlessClient.createFeatureUsage(source + '.delete').setProperty('count', ids.length).submit();
          return dialogService.confirmDanger(translateService.T('Are you sure you want to delete these stacks (includes all stack events)?'), translateService.T('DELETE STACKS')).then(function () {
            function onSuccess() {
              notificationService.info(translateService.T('Successfully queued the stacks for deletion.'));
            }

            function onFailure() {
              $ExceptionlessClient.createFeatureUsage(source + '.delete.error').setProperty('count', ids.length).submit();
              notificationService.error(translateService.T('An error occurred while deleting the stacks.'));
            }

            return executeAction(ids, stackService.remove, onSuccess, onFailure);
          }).catch(function(e){});
        }
      };

      var markFixedAction = {
        name: 'Mark Fixed',
        run: function (ids) {
          $ExceptionlessClient.createFeatureUsage(source + '.mark-fixed').setProperty('count', ids.length).submit();
          return stackDialogService.markFixed().then(function (version) {
            function onSuccess() {
              notificationService.info(translateService.T('Successfully queued the stacks to be marked as fixed.'));
            }

            function onFailure() {
              $ExceptionlessClient.createFeatureUsage(source + '.mark-fixed.error').setProperty('count', ids.length).submit();
              notificationService.error(translateService.T('An error occurred while marking stacks as fixed.'));
            }

            return executeAction(ids, function(ids) { return stackService.markFixed(ids, version); }, onSuccess, onFailure);
          }).catch(function(e){});
        }
      };

      var markNotFixedAction = {
        name: 'Mark Not Fixed',
        run: function (ids) {
          function onSuccess() {
            notificationService.info(translateService.T('Successfully queued the stacks to be marked as not fixed.'));
          }

          function onFailure() {
            $ExceptionlessClient.createFeatureUsage(source + '.mark-not-fixed.error').setProperty('count', ids.length).submit();
            notificationService.error(translateService.T('An error occurred while marking stacks as not fixed.'));
          }

          $ExceptionlessClient.createFeatureUsage(source + '.mark-not-fixed').setProperty('count', ids.length).submit();
          return executeAction(ids, stackService.markNotFixed, onSuccess, onFailure);
        }
      };

      var markHiddenAction = {
        name: 'Mark Hidden',
        run: function (ids) {
          function onSuccess() {
            notificationService.info(translateService.T('Successfully queued the stacks to be marked as hidden.'));
          }

          function onFailure() {
            $ExceptionlessClient.createFeatureUsage(source + '.mark-hidden.error').setProperty('count', ids.length).submit();
            notificationService.error(translateService.T('An error occurred while marking stacks as hidden.'));
          }

          $ExceptionlessClient.createFeatureUsage(source + '.mark-hidden').setProperty('count', ids.length).submit();
          return executeAction(ids, stackService.markHidden, onSuccess, onFailure);
        }
      };

      var markNotHiddenAction = {
        name: 'Mark Not Hidden',
        run: function (ids) {
          function onSuccess() {
            notificationService.info(translateService.T('Successfully queued the stacks to be marked as not hidden.'));
          }

          function onFailure() {
            $ExceptionlessClient.createFeatureUsage(source + '.mark-not-hidden.error').setProperty('count', ids.length).submit();
            notificationService.error(translateService.T('An error occurred while marking stacks as not hidden.'));
          }

          $ExceptionlessClient.createFeatureUsage(source + '.mark-not-hidden').setProperty('count', ids.length).submit();
          return executeAction(ids, stackService.markNotHidden, onSuccess, onFailure);
        }
      };

      function getActions() {
        return [markFixedAction, markNotFixedAction, markHiddenAction, markNotHiddenAction, deleteAction];
      }

      var service = {
        getActions: getActions
      };

      return service;
    });
}());
