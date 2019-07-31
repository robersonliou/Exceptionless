/* global Rickshaw:false */
(function () {
  'use strict';

  angular.module('app.stack')
    .controller('Stack', function ($scope, $ExceptionlessClient, $filter, hotkeys, $state, $stateParams, billingService, dialogs, dialogService, eventService, filterService, notificationService, organizationService, projectService, stackDialogService, stackService, translateService) {
      var vm = this;
      function addHotkeys() {
        function logFeatureUsage(name) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.hotkeys' + name).addTags('hotkeys').submit();
        }

        hotkeys.del('shift+h');
        hotkeys.del('shift+f');
        hotkeys.del('shift+c');
        hotkeys.del('shift+m');
        hotkeys.del('shift+p');
        hotkeys.del('shift+r');
        hotkeys.del('shift+Fbackspace');

        hotkeys.bindTo($scope)
          .add({
            combo: 'shift+h',
            description: translateService.T(vm.stack.is_hidden ? 'Mark Stack Unhidden' : 'Mark Stack Hidden'),
            callback: function markHidden() {
              logFeatureUsage('Hidden');
              vm.updateIsHidden();
            }
          })
          .add({
            combo: 'shift+f',
            description: translateService.T((vm.stack.date_fixed && !vm.stack.is_regressed) ? 'Mark Stack Not fixed' : 'Mark Stack Fixed'),
            callback: function markFixed() {
              logFeatureUsage('Fixed');
              vm.updateIsFixed();
            }
          })
          .add({
            combo: 'shift+c',
            description: translateService.T(vm.stack.occurrences_are_critical ? 'Future Stack Occurrences are Not Critical' : 'Future Stack Occurrences are Critical'),
            callback: function markCritical() {
              logFeatureUsage('Critical');
              vm.updateIsCritical();
            }
          })
          .add({
            combo: 'shift+m',
            description: translateService.T(vm.stack.disable_notifications ? 'Enable Stack Notifications' : 'Disable Stack Notifications'),
            callback: function updateNotifications() {
              logFeatureUsage('Notifications');
              vm.updateNotifications();
            }
          })
          .add({
            combo: 'shift+p',
            description: translateService.T('Promote Stack To External'),
            callback: function promote() {
              logFeatureUsage('Promote');
              vm.promoteToExternal();
            }
          })
          .add({
            combo: 'shift+r',
            description: translateService.T('Add Stack Reference Link'),
            callback: function addReferenceLink() {
              logFeatureUsage('Reference');
              vm.addReferenceLink();
            }
          })
          .add({
            combo: 'shift+backspace',
            description: translateService.T('Delete Stack'),
            callback: function deleteStack() {
              logFeatureUsage('Delete');
              vm.remove();
            }
          });
      }

      function addReferenceLink() {
        $ExceptionlessClient.submitFeatureUsage(vm._source + '.addReferenceLink');
        return dialogs.create('app/stack/add-reference-dialog.tpl.html', 'AddReferenceDialog as vm').result.then(function (url) {
          function onSuccess() {
            $ExceptionlessClient.createFeatureUsage(vm._source + '.addReferenceLink.success').setProperty('url', url).submit();
            vm.stack.references.push(url);
          }

          function onFailure() {
            $ExceptionlessClient.createFeatureUsage(vm._source + '.addReferenceLink.error').setProperty('url', url).submit();
            notificationService.error(translateService.T('An error occurred while adding the reference link.'));
          }

          if (vm.stack.references.indexOf(url) < 0)
            return stackService.addLink(vm._stackId, url).then(onSuccess, onFailure);
        }).catch(function(e){});
      }

      function buildUserStat(users, totalUsers) {
        if (totalUsers === 0) {
          return 0;
        }

        return $filter('percentage')((users / totalUsers * 100.0), 100);
      }

      function buildUserStatTitle(users, totalUsers) {
        return $filter('number')(users, 0) + ' of ' + $filter('number')(totalUsers, 0) +  ' users';
      }

      function executeAction() {
        var action = $stateParams.action;
        if (action === 'mark-fixed' && !(vm.stack.date_fixed && !vm.stack.is_regressed)) {
          return updateIsFixed(true);
        }

        if (action === 'stop-notifications' && !vm.stack.disable_notifications) {
          return updateNotifications(true);
        }
      }

      function canRefresh(data) {
        if (data && data.type === 'Stack' && data.id === vm._stackId) {
          return true;
        }

        if (data && data.type === 'PersistentEvent') {
          if (data.organization_id && data.organization_id !== vm.stack.organization_id) {
            return false;
          }
          if (data.project_id && data.project_id !== vm.stack.project_id) {
            return false;
          }

          if (data.stack_id && data.stack_id !== vm._stackId) {
            return false;
          }

          return true;
        }

        return false;
      }

      function get(data) {
        if (data && data.type === 'Stack' && data.deleted) {
          $state.go('app.dashboard');
          notificationService.error(translateService.T('Stack_Deleted', {stackId: vm._stackId}));
          return;
        }

        if (data && data.type === 'PersistentEvent') {
          return updateStats();
        }

        return getStack().then(updateStats).then(getProject);
      }

      function getOrganizations() {
        function onSuccess(response) {
          vm._organizations = response.data.plain();
          return vm._organizations;
        }

        return organizationService.getAll().then(onSuccess);
      }

      function getProject() {
        function onSuccess(response) {
          vm.project = response.data.plain();
          return vm.project;
        }

        return projectService.getById(vm.stack.project_id, true).then(onSuccess);
      }

      function getStack() {
        function onSuccess(response) {
          vm.stack = response.data.plain();
          vm.stack.references = vm.stack.references || [];
          addHotkeys();
        }

        function onFailure(response) {
          $state.go('app.dashboard');

          if (response.status === 404) {
            notificationService.error(translateService.T('Cannot_Find_Stack', {stackId: vm._stackId}));
          } else {
            notificationService.error(translateService.T('Error_Load_Stack', {stackId: vm._stackId}));
          }
        }

        return stackService.getById(vm._stackId).then(onSuccess, onFailure);
      }

      function getProjectUserStats() {
        function optionsCallback(options) {
          options.filter = 'project:' + vm.stack.project_id;
          return options;
        }

        function onSuccess(response) {
          function getAggregationValue(data, name, defaultValue) {
            var aggs = data.aggregations;
            return aggs && aggs[name] && aggs[name].value || defaultValue;
          }

          vm._total_users = getAggregationValue(response.data, 'cardinality_user', 0);
          vm.stats.users = buildUserStat(vm._users, vm._total_users);
          vm.stats.usersTitle = buildUserStatTitle(vm._users, vm._total_users);
          return response;
        }

        return eventService.count('cardinality:user', optionsCallback).then(onSuccess);
      }

      function updateStats() {
        return getOrganizations().then(getStats);
      }

      function getStats() {
        function buildFields(options) {
          return ' cardinality:user ' + options.filter(function(option) { return option.selected; })
            .reduce(function(fields, option) { fields.push(option.field); return fields; }, [])
            .join(' ');
        }

        function optionsCallback(options) {
          options.filter = ['stack:' + vm._stackId, options.filter].filter(function(f) { return f && f.length > 0; }).join(' ');
          return options;
        }

        function onSuccess(response) {
          function getAggregationValue(data, name, defaultValue) {
            var aggs = data.aggregations;
            return aggs && aggs[name] && aggs[name].value || defaultValue;
          }

          function getAggregationItems(data, name, defaultValue) {
            var aggs = data.aggregations;
            return aggs && aggs[name] && aggs[name].items || defaultValue;
          }

          var results = response.data.plain();
          vm._users = getAggregationValue(results, 'cardinality_user', 0);
          vm.stats = {
            count: $filter('number')(getAggregationValue(results, 'sum_count', 0), 0),
            users: buildUserStat(vm._users, vm._total_users),
            usersTitle: buildUserStatTitle(vm._users, vm._total_users),
            first_occurrence: getAggregationValue(results, 'min_date'),
            last_occurrence: getAggregationValue(results, 'max_date')
          };

          var dateAggregation = getAggregationItems(results, 'date_date', []);
          var colors = ['rgba(124, 194, 49, .7)', 'rgba(60, 116, 0, .9)', 'rgba(89, 89, 89, .3)'];
          vm.chart.options.series = vm.chartOptions
            .filter(function(option) { return option.selected; })
            .reduce(function (series, option, index) {
              series.push({
                name: option.name,
                stroke: 'rgba(0, 0, 0, 0.15)',
                data: dateAggregation.map(function (item) {
                  function getYValue(item, index){
                    var field = option.field.replace(':', '_');
                    var proximity = field.indexOf('~');
                    if (proximity !== -1) {
                      field = field.substring(0, proximity);
                    }

                    return getAggregationValue(item, field, 0);
                  }

                  return { x: moment(item.key).unix(), y: getYValue(item, index), data: item };
                })
              });

              return series;
            }, [])
            .sort(function(a, b) {
              function calculateSum(previous, current) {
                return previous + current.y;
              }

              return b.data.reduce(calculateSum, 0) - a.data.reduce(calculateSum, 0);
            })
            .map(function(seri, index) {
              seri.color = colors[index];
              return seri;
            });

          return response;
        }

        var offset = filterService.getTimeOffset();
        return eventService.count('date:(date' + (offset ? '^' + offset : '') + buildFields(vm.chartOptions) + ') min:date max:date cardinality:user sum:count~1', optionsCallback, false).then(onSuccess).then(getProjectUserStats);
      }

      function hasSelectedChartOption() {
        return vm.chartOptions.filter(function (o) { return o.render && o.selected; }).length > 0;
      }

      function isValidDate(date) {
        var d = moment(date);
        return !!date && d.isValid() && d.year() > 1;
      }

      function promoteToExternal() {
        $ExceptionlessClient.createFeatureUsage(vm._source + '.promoteToExternal').setProperty('id', vm._stackId).submit();
        if (vm.project && !vm.project.has_premium_features) {
          var message = translateService.T('Promote to External is a premium feature used to promote an error stack to an external system. Please upgrade your plan to enable this feature.');
          return billingService.confirmUpgradePlan(message, vm.stack.organization_id).then(function () {
            return promoteToExternal();
          }).catch(function(e){});
        }

        function onSuccess() {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.promoteToExternal.success').setProperty('id', vm._stackId).submit();
          notificationService.success(translateService.T('Successfully promoted stack!'));
        }

        function onFailure(response) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.promoteToExternal.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
          if (response.status === 426) {
            return billingService.confirmUpgradePlan(response.data.message, vm.stack.organization_id).then(function () {
              return promoteToExternal();
            }).catch(function(e){});
          }

          if (response.status === 501) {
            return dialogService.confirm(response.data.message, translateService.T('Manage Integrations')).then(function () {
              $state.go('app.project.manage', { id: vm.stack.project_id });
            }).catch(function(e){});
          }

          notificationService.error(translateService.T('An error occurred while promoting this stack.'));
        }

        return stackService.promote(vm._stackId).then(onSuccess, onFailure);
      }

      function removeReferenceLink(reference) {
        $ExceptionlessClient.createFeatureUsage(vm._source + '.removeReferenceLink').setProperty('id', vm._stackId).submit();
        return dialogService.confirmDanger(translateService.T('Are you sure you want to delete this reference link?'), translateService.T('DELETE REFERENCE LINK')).then(function () {
          function onSuccess() {
            $ExceptionlessClient.createFeatureUsage(vm._source + '.removeReferenceLink.success').setProperty('id', vm._stackId).submit();
          }

          function onFailure(response) {
            $ExceptionlessClient.createFeatureUsage(vm._source + '.removeReferenceLink.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
            notificationService.info(translateService.T('An error occurred while deleting the external reference link.'));
          }

          return stackService.removeLink(vm._stackId, reference).then(onSuccess, onFailure);
        }).catch(function(e){});
      }

      function remove() {
        $ExceptionlessClient.createFeatureUsage(vm._source + '.remove').setProperty('id', vm._stackId).submit();
        var message = translateService.T('Are you sure you want to delete this stack (includes all stack events)?');
        return dialogService.confirmDanger(message, translateService.T('DELETE STACK')).then(function () {
          function onSuccess() {
            notificationService.info(translateService.T('Successfully queued the stack for deletion.'));
            $ExceptionlessClient.createFeatureUsage(vm._source + '.remove.success').setProperty('id', vm._stackId).submit();
            $state.go('app.project-dashboard', { projectId: vm.stack.project_id });
          }

          function onFailure(response) {
            $ExceptionlessClient.createFeatureUsage(vm._source + '.remove.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
            notificationService.error(translateService.T('An error occurred while deleting this stack.'));
          }

          return stackService.remove(vm._stackId).then(onSuccess, onFailure);
        }).catch(function(e){});
      }

      function updateIsCritical() {
        function onSuccess() {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsCritical.success').setProperty('id', vm._stackId).submit();
        }

        function onFailure(response) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsCritical.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
          notificationService.error(translateService.T(vm.stack.occurrences_are_critical ? 'An error occurred while marking future occurrences as not critical.' : 'An error occurred while marking future occurrences as critical.'));
        }

        $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsCritical').setProperty('id', vm._stackId).submit();
        if (vm.stack.occurrences_are_critical) {
          return stackService.markNotCritical(vm._stackId).then(onSuccess, onFailure);
        }

        return stackService.markCritical(vm._stackId).catch(onSuccess, onFailure);
      }

      function updateIsFixed(showSuccessNotification) {
        function onSuccess() {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsFixed.success').setProperty('id', vm._stackId).submit();
          if (!showSuccessNotification) {
            return;
          }

          notificationService.info(translateService.T((vm.stack.date_fixed && !vm.stack.is_regressed) ? 'Successfully queued the stack to be marked as not fixed.' : 'Successfully queued the stack to be marked as fixed.'));
        }

        function onFailure(response) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsFixed.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
          notificationService.error(translateService.T((vm.stack.date_fixed && !vm.stack.is_regressed) ? 'An error occurred while marking this stack as not fixed.' : 'An error occurred while marking this stack as fixed.'));
        }

        $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsFixed').setProperty('id', vm._stackId).submit();
        if (vm.stack.date_fixed && !vm.stack.is_regressed) {
          return stackService.markNotFixed(vm._stackId).then(onSuccess, onFailure);
        }

        return stackDialogService.markFixed().then(function (version) {
          return stackService.markFixed(vm._stackId, version).then(onSuccess, onFailure).catch(function(e){});
        }).catch(function(e){});
      }

      function updateIsHidden() {
        function onSuccess() {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsHidden.success').setProperty('id', vm._stackId).submit();
          notificationService.info(translateService.T(vm.stack.is_hidden ? 'Successfully queued the stack to be marked as shown.' : 'Successfully queued the stack to be marked as hidden.'));
        }

        function onFailure(response) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsHidden.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
          notificationService.error(translateService.T(vm.stack.is_hidden ? 'An error occurred while marking this stack as shown.' : 'An error occurred while marking this stack as hidden.'));
        }

        $ExceptionlessClient.createFeatureUsage(vm._source + '.updateIsHidden').setProperty('id', vm._stackId).submit();
        if (vm.stack.is_hidden) {
          return stackService.markNotHidden(vm._stackId).then(onSuccess, onFailure);
        }

        return stackService.markHidden(vm._stackId).then(onSuccess, onFailure);
      }

      function updateNotifications(showSuccessNotification) {
        function onSuccess() {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateNotifications.success').setProperty('id', vm._stackId).submit();
          if (!showSuccessNotification) {
            return;
          }

          notificationService.info(translateService.T(vm.stack.disable_notifications ? 'Successfully enabled stack notifications.' : 'Successfully disabled stack notifications.'));
        }

        function onFailure(response) {
          $ExceptionlessClient.createFeatureUsage(vm._source + '.updateNotifications.error').setProperty('id', vm._stackId).setProperty('response', response).submit();
          notificationService.error(translateService.T(vm.stack.disable_notifications ? 'An error occurred while enabling stack notifications.' : 'An error occurred while disabling stack notifications.'));
        }

        $ExceptionlessClient.createFeatureUsage(vm._source + '.updateNotifications').setProperty('id', vm._stackId).submit();
        if (vm.stack.disable_notifications) {
          return stackService.enableNotifications(vm._stackId).then(onSuccess, onFailure);
        }

        return stackService.disableNotifications(vm._stackId).then(onSuccess, onFailure);
      }

      this.$onInit = function $onInit() {
        vm._organizations = [];
        vm._source = 'app.stack.Stack';
        vm._stackId = $stateParams.id;
        vm.addReferenceLink = addReferenceLink;

        vm.chart = {
          options: {
            padding: {top: 0.085},
            renderer: 'stack',
            stroke: true,
            unstack: true
          },
          features: {
            hover: {
              render: function (args) {
                var date = moment.unix(args.domainX);
                var dateTimeFormat = translateService.T('DateTimeFormat');
                var dateFormat = translateService.T('DateFormat');
                var formattedDate = date.hours() === 0 && date.minutes() === 0 ? date.format(dateFormat || 'ddd, MMM D, YYYY') : date.format(dateTimeFormat || 'ddd, MMM D, YYYY h:mma');
                var content = '<div class="date">' + formattedDate + '</div>';
                args.detail.sort(function (a, b) {
                  return a.order - b.order;
                }).forEach(function (d) {
                  var swatch = '<span class="detail-swatch" style="background-color: ' + d.series.color.replace('0.5', '1') + '"></span>';
                  content += swatch + $filter('number')(d.formattedYValue) + ' ' + d.series.name + '<br />';
                }, this);

                var xLabel = document.createElement('div');
                xLabel.className = 'x_label';
                xLabel.innerHTML = content;
                this.element.appendChild(xLabel);

                // If left-alignment results in any error, try right-alignment.
                var leftAlignError = this._calcLayoutError([xLabel]);
                if (leftAlignError > 0) {
                  xLabel.classList.remove('left');
                  xLabel.classList.add('right');

                  // If right-alignment is worse than left alignment, switch back.
                  var rightAlignError = this._calcLayoutError([xLabel]);
                  if (rightAlignError > leftAlignError) {
                    xLabel.classList.remove('right');
                    xLabel.classList.add('left');
                  }
                }

                this.show();
              }
            },
            range: {
              onSelection: function (position) {
                var start = moment.unix(position.coordMinX).utc().local();
                var end = moment.unix(position.coordMaxX).utc().local();

                filterService.setTime(start.format('YYYY-MM-DDTHH:mm:ss') + '-' + end.format('YYYY-MM-DDTHH:mm:ss'));
                $ExceptionlessClient.createFeatureUsage(vm._source + '.chart.range.onSelection')
                  .setProperty('id', vm._stackId)
                  .setProperty('start', start)
                  .setProperty('end', end)
                  .submit();

                return false;
              }
            },
            xAxis: {
              timeFixture: new Rickshaw.Fixtures.Time.Local(),
              overrideTimeFixtureCustomFormatters: true
            },
            yAxis: {
              ticks: 5,
              tickFormat: 'formatKMBT',
              ticksTreatment: 'glow'
            }
          }
        };

        vm.chartOptions = [
          {name: translateService.T('Occurrences'), field: 'sum:count~1', title: '', selected: true, render: false},
          {name: translateService.T('Average Value'), field: 'avg:value', title: translateService.T('The average of all event values'), render: true, menuName: translateService.T('Show Average Value')},
          {name: translateService.T('Value Sum'), field: 'sum:value', title: translateService.T('The sum of all event values'), render: true, menuName: translateService.T('Show Value Sum')}
        ];

        vm.canRefresh = canRefresh;
        vm.get = get;
        vm.updateStats = updateStats;
        vm.hasSelectedChartOption = hasSelectedChartOption;
        vm.isValidDate = isValidDate;
        vm.promoteToExternal = promoteToExternal;
        vm.project = {};
        vm.remove = remove;
        vm.removeReferenceLink = removeReferenceLink;
        vm.recentOccurrences = {
          get: function (options) {
            return eventService.getByStackId(vm._stackId, options);
          },
          summary: {
            showType: false
          },
          options: {
            limit: 10,
            mode: 'summary'
          },
          source: vm._source + '.Recent'
        };
        vm.stack = {};
        vm.stats = {
          count: 0,
          users: buildUserStat(0, 0),
          usersTitle: buildUserStatTitle(0, 0),
          first_occurrence: undefined,
          last_occurrence: undefined
        };

        vm._users = 0;
        vm._total_users = 0;
        vm.updateIsCritical = updateIsCritical;
        vm.updateIsFixed = updateIsFixed;
        vm.updateIsHidden = updateIsHidden;
        vm.updateNotifications = updateNotifications;

        get().then(executeAction);
      };
    });
}());
